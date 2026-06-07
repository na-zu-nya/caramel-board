import type { DatabaseSync } from 'node:sqlite';
import { toPublicAssetPath, withPublicAssetArray } from '../utils/assetPath';
import { getStandaloneSqlite, nowIso, parseJsonObject } from './sqlite';

export interface StandaloneStackListParams {
  dataSetId: number;
  collection?: number;
  mediaType?: 'image' | 'comic' | 'video';
  tag?: string | string[];
  author?: string | string[];
  fav?: '0' | '1';
  liked?: '0' | '1';
  hasNoTags?: boolean;
  hasNoAuthor?: boolean;
  search?: string;
  stackIds?: number[];
  sort?: 'recommended' | 'dateAdded' | 'name' | 'likes' | 'updated' | 'id';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

interface StackRow {
  id: number;
  dataset_id: number;
  author_id: number | null;
  author_name: string | null;
  name: string;
  thumbnail: string;
  media_type: string;
  liked: number;
  meta_json: string | null;
  dominant_colors_json: string | null;
  created_at: string;
  updated_at: string;
  asset_count: number;
  is_favorite: number;
}

interface AssetRow {
  id: number;
  stack_id: number;
  file: string;
  thumbnail: string;
  preview: string | null;
  file_type: string;
  original_name: string;
  hash: string;
  order_in_stack: number;
  meta_json: string | null;
  dominant_colors_json: string | null;
  created_at: string;
  updated_at: string;
  is_favorite?: number;
}

interface TagRow {
  id: number;
  title: string;
}

interface CountRow {
  count: number;
}

const toArray = (value: string | string[] | undefined) => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const parseJsonArray = (value: string | null | undefined): unknown[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const placeholders = (values: unknown[]) => values.map(() => '?').join(', ');

const toAsset = (row: AssetRow, dataSetId: number) => ({
  id: row.id,
  stackId: row.stack_id,
  file: toPublicAssetPath(row.file, dataSetId),
  thumbnail: toPublicAssetPath(row.thumbnail, dataSetId),
  preview: row.preview ? toPublicAssetPath(row.preview, dataSetId) : null,
  fileType: row.file_type,
  mimeType: row.file_type,
  originalName: row.original_name,
  hash: row.hash,
  orderInStack: row.order_in_stack,
  meta: parseJsonObject(row.meta_json),
  dominantColors: parseJsonArray(row.dominant_colors_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  favorited: row.is_favorite === 1,
  isFavorite: row.is_favorite === 1,
});

export class StandaloneStackRepository {
  constructor(private db: DatabaseSync = getStandaloneSqlite()) {}

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

  private buildStackWhere(params: StandaloneStackListParams, sqlParams: unknown[]) {
    const where = ['s.dataset_id = ?'];
    sqlParams.push(params.dataSetId);

    if (params.collection) {
      where.push(
        'EXISTS (SELECT 1 FROM collection_stacks cs WHERE cs.stack_id = s.id AND cs.collection_id = ?)'
      );
      sqlParams.push(params.collection);
    }

    if (params.stackIds) {
      if (params.stackIds.length === 0) {
        where.push('0 = 1');
      } else {
        where.push(`s.id IN (${placeholders(params.stackIds)})`);
        sqlParams.push(...params.stackIds);
      }
    }

    if (params.mediaType) {
      where.push('s.media_type = ?');
      sqlParams.push(params.mediaType);
    }

    const tags = toArray(params.tag).filter((tag) => tag.trim().length > 0);
    if (tags.length > 0) {
      where.push(`EXISTS (
        SELECT 1
        FROM stack_tags st
        JOIN tags t ON t.id = st.tag_id
        WHERE st.stack_id = s.id AND t.title IN (${placeholders(tags)})
      )`);
      sqlParams.push(...tags);
    }

    const authors = toArray(params.author).filter((author) => author.trim().length > 0);
    if (authors.length > 0) {
      where.push(`a.name IN (${placeholders(authors)})`);
      sqlParams.push(...authors);
    }

    if (params.fav === '1') {
      where.push('EXISTS (SELECT 1 FROM stack_favorites sf WHERE sf.stack_id = s.id)');
    } else if (params.fav === '0') {
      where.push('NOT EXISTS (SELECT 1 FROM stack_favorites sf WHERE sf.stack_id = s.id)');
    }

    if (params.liked === '1') {
      where.push('s.liked <> 0');
    } else if (params.liked === '0') {
      where.push('s.liked = 0');
    }

    if (params.hasNoTags) {
      where.push('NOT EXISTS (SELECT 1 FROM stack_tags st WHERE st.stack_id = s.id)');
    }

    if (params.hasNoAuthor) {
      where.push('s.author_id IS NULL');
    }

    const search = params.search?.trim();
    if (search) {
      const like = `%${search}%`;
      where.push(`(
        s.name LIKE ? COLLATE NOCASE OR
        a.name LIKE ? COLLATE NOCASE OR
        EXISTS (
          SELECT 1
          FROM stack_tags st
          JOIN tags t ON t.id = st.tag_id
          WHERE st.stack_id = s.id AND t.title LIKE ? COLLATE NOCASE
        )
      )`);
      sqlParams.push(like, like, like);
    }

    return where.join(' AND ');
  }

  private stackSelectSql(whereSql: string) {
    return `
      SELECT
        s.id,
        s.dataset_id,
        s.author_id,
        a.name AS author_name,
        s.name,
        s.thumbnail,
        s.media_type,
        s.liked,
        s.meta_json,
        s.dominant_colors_json,
        s.created_at,
        s.updated_at,
        COUNT(asset_count.id) AS asset_count,
        CASE WHEN EXISTS (SELECT 1 FROM stack_favorites sf WHERE sf.stack_id = s.id) THEN 1 ELSE 0 END AS is_favorite
      FROM stacks s
      LEFT JOIN authors a ON a.id = s.author_id
      LEFT JOIN assets asset_count ON asset_count.stack_id = s.id
      WHERE ${whereSql}
      GROUP BY s.id
    `;
  }

  private orderBy(params: StandaloneStackListParams) {
    const direction = params.order === 'asc' ? 'ASC' : 'DESC';
    switch (params.sort) {
      case 'dateAdded':
        return `s.created_at ${direction}, s.id ${direction}`;
      case 'name':
        return `s.name ${direction}, s.id DESC`;
      case 'likes':
        return `s.liked ${direction}, s.updated_at DESC`;
      case 'id':
        return `s.id ${direction}`;
      default:
        return `s.updated_at ${direction}, s.created_at ${direction}, s.id ${direction}`;
    }
  }

  getPaginated(params: StandaloneStackListParams) {
    const sqlParams: unknown[] = [];
    const whereSql = this.buildStackWhere(params, sqlParams);
    const countRow = this.db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM stacks s
        LEFT JOIN authors a ON a.id = s.author_id
        WHERE ${whereSql}
      `)
      .get(...sqlParams) as CountRow | undefined;

    const rows = this.db
      .prepare(`${this.stackSelectSql(whereSql)} ORDER BY ${this.orderBy(params)} LIMIT ? OFFSET ?`)
      .all(...sqlParams, params.limit, params.offset) as StackRow[];

    return {
      stacks: rows.map((row) => this.toStack(row, { includeAssets: true })),
      total: countRow?.count ?? 0,
      limit: params.limit,
      offset: params.offset,
    };
  }

  getById(id: number, dataSetId?: number) {
    const params: unknown[] = [id];
    const where = ['s.id = ?'];
    if (dataSetId !== undefined) {
      where.push('s.dataset_id = ?');
      params.push(dataSetId);
    }

    const row = this.db.prepare(this.stackSelectSql(where.join(' AND '))).get(...params) as
      | StackRow
      | undefined;

    return row ? this.toStack(row, { includeAssets: true, includeTags: true }) : null;
  }

  getAssetsByStackId(stackId: number, dataSetId: number) {
    const rows = this.db
      .prepare(
        `SELECT
           assets.*,
           CASE WHEN af.id IS NULL THEN 0 ELSE 1 END AS is_favorite
         FROM assets
         JOIN stacks s ON s.id = assets.stack_id
         LEFT JOIN asset_favorites af ON af.asset_id = assets.id
         WHERE assets.stack_id = ? AND s.dataset_id = ?
         ORDER BY assets.order_in_stack ASC, assets.id ASC`
      )
      .all(stackId, dataSetId) as AssetRow[];

    return rows.map((row) => toAsset(row, dataSetId));
  }

  updateAssetMeta(assetId: number, dataSetId: number, meta: Record<string, unknown>) {
    const result = this.db
      .prepare(
        `UPDATE assets
         SET meta_json = ?, updated_at = ?
         WHERE id = ? AND stack_id IN (SELECT id FROM stacks WHERE dataset_id = ?)`
      )
      .run(JSON.stringify(meta), nowIso(), assetId, dataSetId);
    if (result.changes === 0) return null;
    return { success: true, meta };
  }

  updateAssetOrder(assetId: number, order: number) {
    const asset = this.getAssetWithDataset(assetId);
    if (!asset) return false;
    this.db
      .prepare('UPDATE assets SET order_in_stack = ?, updated_at = ? WHERE id = ?')
      .run(order, nowIso(), assetId);
    return true;
  }

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
    const stack = this.getStackDataset(stackId);
    if (!stack) return null;
    const userId = this.ensureUserId();
    const now = nowIso();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('UPDATE stacks SET liked = liked + 1, updated_at = ? WHERE id = ?')
        .run(now, stackId);
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

  addTag(stackId: number, tagTitle: string) {
    const stack = this.getStackDataset(stackId);
    if (!stack) return null;
    const now = nowIso();
    const existing = this.db
      .prepare('SELECT id FROM tags WHERE dataset_id = ? AND title = ? COLLATE NOCASE')
      .get(stack.dataset_id, tagTitle) as { id: number } | undefined;
    const tagId =
      existing?.id ??
      Number(
        this.db
          .prepare('INSERT INTO tags (dataset_id, title) VALUES (?, ?)')
          .run(stack.dataset_id, tagTitle).lastInsertRowid
      );
    this.db
      .prepare('INSERT OR IGNORE INTO stack_tags (stack_id, tag_id) VALUES (?, ?)')
      .run(stackId, tagId);
    this.db.prepare('UPDATE stacks SET updated_at = ? WHERE id = ?').run(now, stackId);
    return { success: true, tag: tagTitle };
  }

  removeTag(stackId: number, tagTitle: string) {
    const stack = this.getStackDataset(stackId);
    if (!stack) return null;
    this.db
      .prepare(
        `DELETE FROM stack_tags
         WHERE stack_id = ? AND tag_id IN (
           SELECT id FROM tags WHERE dataset_id = ? AND title = ? COLLATE NOCASE
         )`
      )
      .run(stackId, stack.dataset_id, tagTitle);
    this.db.prepare('UPDATE stacks SET updated_at = ? WHERE id = ?').run(nowIso(), stackId);
    return { success: true };
  }

  updateAuthor(stackId: number, name: string) {
    const stack = this.getStackDataset(stackId);
    if (!stack) return null;
    const existing = this.db
      .prepare('SELECT id FROM authors WHERE dataset_id = ? AND name = ? COLLATE NOCASE')
      .get(stack.dataset_id, name) as { id: number } | undefined;
    const authorId =
      existing?.id ??
      Number(
        this.db
          .prepare('INSERT INTO authors (dataset_id, name) VALUES (?, ?)')
          .run(stack.dataset_id, name).lastInsertRowid
      );
    this.db
      .prepare('UPDATE stacks SET author_id = ?, updated_at = ? WHERE id = ?')
      .run(authorId, nowIso(), stackId);
    return { success: true, author: name };
  }

  deleteStack(stackId: number) {
    const result = this.db.prepare('DELETE FROM stacks WHERE id = ?').run(stackId);
    return result.changes > 0;
  }

  deleteAsset(assetId: number) {
    const asset = this.getAssetWithDataset(assetId);
    if (!asset) return false;
    this.db.prepare('DELETE FROM assets WHERE id = ?').run(assetId);
    this.refreshStackThumbnail(asset.stack_id);
    return true;
  }

  getCollectionIdsByStackId(stackId: number) {
    const rows = this.db
      .prepare(
        `SELECT collection_id
         FROM collection_stacks
         WHERE stack_id = ?
         ORDER BY collection_id ASC`
      )
      .all(stackId) as Array<{ collection_id: number }>;
    return { collectionIds: rows.map((row) => row.collection_id) };
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

  private toStack(row: StackRow, options: { includeAssets?: boolean; includeTags?: boolean } = {}) {
    const assets = options.includeAssets ? this.getAssetsByStackId(row.id, row.dataset_id) : [];
    const tags = options.includeTags ? this.getTagsByStackId(row.id) : undefined;
    const thumbnail = toPublicAssetPath(assets[0]?.thumbnail || row.thumbnail, row.dataset_id);
    const likeCount = Number(row.liked ?? 0);
    const isFavorite = row.is_favorite === 1;

    return {
      id: row.id,
      dataSetId: row.dataset_id,
      datasetId: String(row.dataset_id),
      authorId: row.author_id,
      author: row.author_name ? { id: row.author_id, name: row.author_name } : null,
      name: row.name,
      thumbnail,
      mediaType: row.media_type,
      liked: likeCount,
      likeCount,
      meta: parseJsonObject(row.meta_json),
      dominantColors: parseJsonArray(row.dominant_colors_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updateAt: row.updated_at,
      assetCount: row.asset_count,
      assetsCount: row.asset_count,
      favorited: isFavorite,
      isFavorite,
      tags,
      assets: withPublicAssetArray(assets, row.dataset_id),
    };
  }

  private getTagsByStackId(stackId: number) {
    return this.db
      .prepare(
        `SELECT t.id, t.title
         FROM tags t
         JOIN stack_tags st ON st.tag_id = t.id
         WHERE st.stack_id = ?
         ORDER BY t.title ASC`
      )
      .all(stackId) as TagRow[];
  }

  private stackExists(stackId: number) {
    return Boolean(this.db.prepare('SELECT id FROM stacks WHERE id = ?').get(stackId));
  }

  private getStackDataset(stackId: number) {
    return this.db.prepare('SELECT id, dataset_id FROM stacks WHERE id = ?').get(stackId) as
      | { id: number; dataset_id: number }
      | undefined;
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

  private refreshStackThumbnail(stackId: number) {
    const asset = this.db
      .prepare(
        `SELECT thumbnail
         FROM assets
         WHERE stack_id = ?
         ORDER BY order_in_stack ASC, id ASC
         LIMIT 1`
      )
      .get(stackId) as { thumbnail: string } | undefined;
    this.db
      .prepare('UPDATE stacks SET thumbnail = ?, updated_at = ? WHERE id = ?')
      .run(asset?.thumbnail ?? '', nowIso(), stackId);
  }
}
