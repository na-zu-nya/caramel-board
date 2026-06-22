import type { DatabaseSync } from 'node:sqlite';
import { toPublicAssetPath } from '../../../utils/assetPath';
import { nowIso } from '../sqlite';
import { getStackDataset } from './helpers';

export class StackFavoriteService {
  constructor(private db: DatabaseSync) {}

  toggleStackFavorite(stackId: number, favorited: boolean) {
    if (!this.stackExists(stackId)) return false;
    const userId = this.ensureUserId();
    if (favorited) {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO stack_favorites (user_id, stack_id, created_at) VALUES (?, ?, ?)'
        )
        .run(userId, stackId, nowIso());
    } else {
      this.db
        .prepare('DELETE FROM stack_favorites WHERE user_id = ? AND stack_id = ?')
        .run(userId, stackId);
    }
    return true;
  }

  toggleAssetFavorite(assetId: number, favorited: boolean) {
    if (!this.getAssetWithDataset(assetId)) return false;
    const userId = this.ensureUserId();
    if (favorited) {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO asset_favorites (user_id, asset_id, created_at) VALUES (?, ?, ?)'
        )
        .run(userId, assetId, nowIso());
    } else {
      this.db
        .prepare('DELETE FROM asset_favorites WHERE user_id = ? AND asset_id = ?')
        .run(userId, assetId);
    }
    return true;
  }

  likeStack(stackId: number, assetId?: number) {
    const stack = getStackDataset(this.db, stackId);
    if (!stack) return null;
    const userId = this.ensureUserId();
    const now = nowIso();
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE stacks SET liked = liked + 1 WHERE id = ?').run(stackId);
      this.db
        .prepare(
          'INSERT INTO like_activities (stack_id, asset_id, user_id, created_at) VALUES (?, ?, ?, ?)'
        )
        .run(stackId, assetId ?? null, userId, now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    const liked = (
      this.db.prepare('SELECT liked FROM stacks WHERE id = ?').get(stackId) as
        | { liked: number }
        | undefined
    )?.liked;
    return { stackId, datasetId: stack.dataset_id, liked: liked ?? 0 };
  }

  likeAsset(assetId: number) {
    const asset = this.getAssetWithDataset(assetId);
    if (!asset) return null;
    const liked = this.likeStack(asset.stack_id, asset.id);
    if (!liked) return null;
    return { ...liked, assetId: asset.id };
  }

  getFavoriteItems(dataSetId: number, limit: number, offset: number) {
    const userId = this.ensureUserId();
    const stackRows = this.db
      .prepare(
        `SELECT
           sf.id AS favorite_id,
           sf.created_at AS favorite_created_at,
           s.id AS stack_id,
           s.name,
           s.thumbnail,
           s.media_type,
           s.liked,
           s.created_at,
           s.updated_at,
           COUNT(a.id) AS asset_count,
           first_asset.thumbnail AS first_asset_thumbnail
         FROM stack_favorites sf
         JOIN stacks s ON s.id = sf.stack_id
         LEFT JOIN assets a ON a.stack_id = s.id
         LEFT JOIN assets first_asset ON first_asset.id = (
           SELECT id FROM assets WHERE stack_id = s.id ORDER BY order_in_stack ASC, id ASC LIMIT 1
         )
         WHERE sf.user_id = ? AND s.dataset_id = ?
         GROUP BY sf.id, s.id`
      )
      .all(userId, dataSetId) as Array<{
      favorite_id: number;
      favorite_created_at: string;
      stack_id: number;
      name: string;
      thumbnail: string;
      media_type: string;
      liked: number;
      created_at: string;
      updated_at: string;
      asset_count: number;
      first_asset_thumbnail: string | null;
    }>;

    const assetRows = this.db
      .prepare(
        `SELECT
           af.id AS favorite_id,
           af.created_at AS favorite_created_at,
           asset.id AS asset_id,
           asset.thumbnail AS asset_thumbnail,
           asset.file AS asset_file,
           asset.order_in_stack,
           s.id AS stack_id,
           s.name,
           s.media_type,
           s.liked,
           s.created_at,
           s.updated_at,
           COUNT(all_assets.id) AS asset_count,
           CASE WHEN sf.id IS NULL THEN 0 ELSE 1 END AS stack_favorited
         FROM asset_favorites af
         JOIN assets asset ON asset.id = af.asset_id
         JOIN stacks s ON s.id = asset.stack_id
         LEFT JOIN assets all_assets ON all_assets.stack_id = s.id
         LEFT JOIN stack_favorites sf ON sf.stack_id = s.id AND sf.user_id = af.user_id
         WHERE af.user_id = ? AND s.dataset_id = ?
         GROUP BY af.id, asset.id, s.id`
      )
      .all(userId, dataSetId) as Array<{
      favorite_id: number;
      favorite_created_at: string;
      asset_id: number;
      asset_thumbnail: string | null;
      asset_file: string;
      order_in_stack: number;
      stack_id: number;
      name: string;
      media_type: string;
      liked: number;
      created_at: string;
      updated_at: string;
      asset_count: number;
      stack_favorited: number;
    }>;

    const combined = [
      ...stackRows.map((row) => {
        const likeCount = Number(row.liked ?? 0);
        return {
          id: row.stack_id,
          stackId: row.stack_id,
          favoriteKind: 'stack' as const,
          favoriteId: row.favorite_id,
          favoriteCreatedAt: row.favorite_created_at,
          name: row.name,
          mediaType: row.media_type,
          thumbnail: toPublicAssetPath(row.first_asset_thumbnail || row.thumbnail, dataSetId),
          favorited: true,
          isFavorite: true,
          liked: likeCount,
          likeCount,
          assetCount: row.asset_count,
          assetsCount: row.asset_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
      ...assetRows.map((row) => {
        const likeCount = Number(row.liked ?? 0);
        return {
          id: `asset:${row.asset_id}`,
          stackId: row.stack_id,
          favoriteKind: 'asset' as const,
          favoriteId: row.favorite_id,
          favoriteCreatedAt: row.favorite_created_at,
          assetId: row.asset_id,
          favoritePage: row.order_in_stack + 1,
          name: row.name,
          mediaType: row.media_type,
          thumbnail: toPublicAssetPath(row.asset_thumbnail || row.asset_file, dataSetId),
          favorited: true,
          isFavorite: true,
          stackFavorited: row.stack_favorited === 1,
          liked: likeCount,
          likeCount,
          assetCount: row.asset_count,
          assetsCount: row.asset_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    ].sort((left, right) => right.favoriteCreatedAt.localeCompare(left.favoriteCreatedAt));

    return {
      stacks: combined.slice(offset, offset + limit),
      total: combined.length,
      limit,
      offset,
    };
  }

  private ensureUserId() {
    const existing = this.db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as
      | { id: number }
      | undefined;
    if (existing) return existing.id;

    const now = nowIso();
    const result = this.db
      .prepare('INSERT INTO users (name, role, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('Standalone User', 'super', now, now);
    return Number(result.lastInsertRowid);
  }

  private stackExists(stackId: number) {
    return Boolean(this.db.prepare('SELECT id FROM stacks WHERE id = ?').get(stackId));
  }
  private getAssetWithDataset(assetId: number) {
    return this.db
      .prepare(
        `SELECT assets.id, assets.stack_id, s.dataset_id
         FROM assets
         JOIN stacks s ON s.id = assets.stack_id
         WHERE assets.id = ?`
      )
      .get(assetId) as { id: number; stack_id: number; dataset_id: number } | undefined;
  }
}
