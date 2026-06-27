import type { DatabaseSync } from 'node:sqlite';
import { toPublicAssetPath } from '../../utils/assetPath';
import { getStandaloneSqlite, nowIso, parseJsonObject, stringifyJsonObject } from './sqlite';

export interface StandaloneDataset {
  id: number;
  name: string;
  icon: string | null;
  themeColor: string | null;
  description: string | null;
  settings: Record<string, unknown>;
  isProtected: boolean;
  passwordHash: string | null;
  passwordSalt: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StandaloneDatasetInput {
  name?: string;
  icon?: string;
  themeColor?: string;
  description?: string;
  settings?: Record<string, unknown>;
}

interface DatasetRow {
  id: number;
  name: string;
  icon: string | null;
  theme_color: string | null;
  description: string | null;
  settings_json: string | null;
  is_protected: number;
  password_hash: string | null;
  password_salt: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  count: number;
}

interface ThumbnailRow {
  thumbnail: string | null;
}

interface CollectionOverviewRow {
  id: number;
  name: string;
  icon: string;
  count: number;
  thumbnail: string | null;
}

interface TagCloudRow {
  id: number;
  name: string;
  count: number;
}

interface RecentLikeRow {
  id: number;
  name: string;
  thumbnail: string | null;
  liked: number;
  media_type: string;
  created_at: string;
  updated_at: string;
  asset_id: number | null;
  asset_file: string | null;
  asset_thumbnail: string | null;
}

const toDataset = (row: DatasetRow): StandaloneDataset => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  themeColor: row.theme_color,
  description: row.description,
  settings: parseJsonObject(row.settings_json),
  isProtected: row.is_protected === 1,
  passwordHash: row.password_hash,
  passwordSalt: row.password_salt,
  isDefault: row.is_default === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getCount = (db: DatabaseSync, sql: string, ...params: Array<string | number>) => {
  const row = db.prepare(sql).get(...params) as CountRow | undefined;
  return row?.count ?? 0;
};

export class StandaloneDatasetRepository {
  constructor(private db: DatabaseSync = getStandaloneSqlite()) {}

  getAll(): StandaloneDataset[] {
    const rows = this.db
      .prepare('SELECT * FROM datasets ORDER BY created_at ASC')
      .all() as DatasetRow[];
    return rows.map(toDataset);
  }

  getById(id: number): StandaloneDataset | null {
    const row = this.db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as
      | DatasetRow
      | undefined;
    return row ? toDataset(row) : null;
  }

  create(data: StandaloneDatasetInput): StandaloneDataset {
    const now = nowIso();
    const existingCount = getCount(this.db, 'SELECT COUNT(*) AS count FROM datasets');
    const isDefault = existingCount === 0 ? 1 : 0;
    const result = this.db
      .prepare(
        `INSERT INTO datasets
          (name, icon, theme_color, description, settings_json, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.name,
        data.icon ?? null,
        data.themeColor ?? null,
        data.description ?? null,
        stringifyJsonObject(data.settings),
        isDefault,
        now,
        now
      );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  update(id: number, data: StandaloneDatasetInput): StandaloneDataset | null {
    const current = this.getById(id);
    if (!current) return null;

    this.db
      .prepare(
        `UPDATE datasets
         SET name = ?, icon = ?, theme_color = ?, description = ?, settings_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        data.name ?? current.name,
        data.icon ?? current.icon,
        data.themeColor ?? current.themeColor,
        data.description ?? current.description,
        stringifyJsonObject(data.settings ?? current.settings),
        nowIso(),
        id
      );

    return this.getById(id);
  }

  delete(id: number): 'deleted' | 'not_found' | 'is_default' {
    const current = this.getById(id);
    if (!current) return 'not_found';
    if (current.isDefault) return 'is_default';
    this.db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
    return 'deleted';
  }

  setDefault(id: number): boolean {
    const current = this.getById(id);
    if (!current) return false;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE datasets SET is_default = 0').run();
      this.db
        .prepare('UPDATE datasets SET is_default = 1, updated_at = ? WHERE id = ?')
        .run(nowIso(), id);
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  setProtection(
    id: number,
    protection: { isProtected: boolean; passwordHash: string | null; passwordSalt: string | null }
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE datasets
         SET is_protected = ?, password_hash = ?, password_salt = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        protection.isProtected ? 1 : 0,
        protection.passwordHash,
        protection.passwordSalt,
        nowIso(),
        id
      );
    return result.changes > 0;
  }

  getStats(id: number) {
    const stackCount = getCount(
      this.db,
      'SELECT COUNT(*) AS count FROM stacks WHERE dataset_id = ?',
      id
    );
    const assetCount = getCount(
      this.db,
      'SELECT COUNT(*) AS count FROM assets a JOIN stacks s ON s.id = a.stack_id WHERE s.dataset_id = ?',
      id
    );
    return { stackCount, assetCount };
  }

  getOverview(id: number) {
    const mediaTypes = ['image', 'comic', 'video'].map((mediaType) => {
      const count = getCount(
        this.db,
        'SELECT COUNT(*) AS count FROM stacks WHERE dataset_id = ? AND media_type = ?',
        id,
        mediaType
      );
      const thumbnailRow = this.db
        .prepare(
          `SELECT COALESCE(a.thumbnail, s.thumbnail) AS thumbnail
           FROM stacks s
           LEFT JOIN assets a ON a.id = (
             SELECT id FROM assets
             WHERE stack_id = s.id
             ORDER BY order_in_stack ASC, id ASC
             LIMIT 1
           )
           WHERE s.dataset_id = ? AND s.media_type = ?
           ORDER BY s.created_at DESC, s.id DESC
           LIMIT 1`
        )
        .get(id, mediaType) as ThumbnailRow | undefined;

      return {
        mediaType,
        count,
        thumbnail: toPublicAssetPath(thumbnailRow?.thumbnail, id) || null,
      };
    });

    const collections = (
      this.db
        .prepare(
          `SELECT
             c.id,
             c.name,
             c.icon,
             COUNT(cs.stack_id) AS count,
             (
               SELECT a.thumbnail
               FROM collection_stacks cs2
               JOIN stacks s2 ON s2.id = cs2.stack_id
               LEFT JOIN assets a ON a.id = (
                 SELECT id FROM assets
                 WHERE stack_id = s2.id
                 ORDER BY order_in_stack ASC, id ASC
                 LIMIT 1
               )
               WHERE cs2.collection_id = c.id
               ORDER BY cs2.order_index ASC, cs2.added_at ASC
               LIMIT 1
             ) AS thumbnail
           FROM collections c
           LEFT JOIN collection_stacks cs ON cs.collection_id = c.id
           WHERE c.dataset_id = ?
           GROUP BY c.id
           ORDER BY c.updated_at DESC
           LIMIT 10`
        )
        .all(id) as CollectionOverviewRow[]
    ).map((collection) => ({
      ...collection,
      thumbnail: toPublicAssetPath(collection.thumbnail, id) || null,
    }));

    const tagCloud = this.db
      .prepare(
        `SELECT t.id, t.title AS name, COUNT(st.stack_id) AS count
         FROM tags t
         JOIN stack_tags st ON st.tag_id = t.id
         JOIN stacks s ON s.id = st.stack_id
         WHERE t.dataset_id = ? AND s.dataset_id = ?
         GROUP BY t.id
         ORDER BY count DESC, t.title ASC
         LIMIT 20`
      )
      .all(id, id) as TagCloudRow[];

    const recentLikes = (
      this.db
        .prepare(
          `SELECT
             s.id,
             s.name,
             s.thumbnail,
             s.liked,
             s.media_type,
             s.created_at,
             s.updated_at,
             a.id AS asset_id,
             a.file AS asset_file,
             a.thumbnail AS asset_thumbnail
           FROM stacks s
           LEFT JOIN (
             SELECT stack_id, MAX(created_at) AS last_liked
             FROM like_activities
             GROUP BY stack_id
           ) l ON l.stack_id = s.id
           LEFT JOIN assets a ON a.id = (
             SELECT id FROM assets
             WHERE stack_id = s.id
             ORDER BY order_in_stack ASC, id ASC
             LIMIT 1
           )
           WHERE s.dataset_id = ? AND s.liked <> 0
           ORDER BY l.last_liked DESC, s.updated_at DESC
           LIMIT 12`
        )
        .all(id) as RecentLikeRow[]
    ).map((row) => ({
      id: row.id,
      name: row.name,
      thumbnail: toPublicAssetPath(row.asset_thumbnail || row.thumbnail, id),
      likeCount: row.liked,
      mediaType: row.media_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assets: row.asset_id
        ? [
            {
              id: row.asset_id,
              file: toPublicAssetPath(row.asset_file, id),
              thumbnail: toPublicAssetPath(row.asset_thumbnail, id),
            },
          ]
        : [],
    }));

    return {
      mediaTypes,
      collections,
      tagCloud,
      recentLikes,
    };
  }
}
