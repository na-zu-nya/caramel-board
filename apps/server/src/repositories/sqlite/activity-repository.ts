import type { DatabaseSync } from 'node:sqlite';
import { toPublicAssetPath } from '../../utils/assetPath';
import { getStandaloneSqlite, type SqliteBindValue } from './sqlite';
import { StandaloneStackRepository } from './stack-repository';

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export interface YearlyLikesOptions {
  year: number;
  datasetId?: string;
  search?: string;
}

interface CountRow {
  count: number;
}

interface MediaTypeRow {
  media_type: string;
}

interface StackIdRow {
  id: number;
}

interface LikeActivityRow {
  id: number;
  stack_id: number;
  asset_id: number | null;
  created_at: string;
  asset_file: string | null;
  asset_thumbnail: string | null;
  asset_order_in_stack: number | null;
  dataset_id: number;
}

interface YearRow {
  year: string;
}

const toStackWithLikeContext = (
  stack: ReturnType<StandaloneStackRepository['getById']>,
  row: LikeActivityRow
) => {
  if (!stack) return null;
  const activityThumbnail = row.asset_id
    ? toPublicAssetPath(row.asset_thumbnail || row.asset_file || stack.thumbnail, stack.dataSetId)
    : stack.thumbnail;
  return {
    ...stack,
    thumbnail: activityThumbnail,
    tags: Array.isArray(stack.tags)
      ? stack.tags.map((tag) =>
          typeof tag === 'object' && tag !== null && 'title' in tag
            ? String(tag.title)
            : String(tag)
        )
      : [],
  };
};

export class StandaloneActivityRepository {
  private stackRepository: StandaloneStackRepository;

  constructor(private db: DatabaseSync = getStandaloneSqlite()) {
    this.stackRepository = new StandaloneStackRepository(db);
  }

  getGroupedByCategory({ limit, offset }: PaginationOptions) {
    const mediaTypes = this.db
      .prepare('SELECT DISTINCT media_type FROM stacks ORDER BY media_type ASC')
      .all() as MediaTypeRow[];
    const activities: Record<string, unknown[]> = {};

    for (const { media_type: mediaType } of mediaTypes) {
      const rows = this.db
        .prepare(
          `SELECT id
           FROM stacks
           WHERE media_type = ?
           ORDER BY updated_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(mediaType, limit, offset) as StackIdRow[];
      activities[mediaType] = rows
        .map((row) => this.stackRepository.getById(row.id))
        .filter((stack): stack is NonNullable<typeof stack> => Boolean(stack));
    }

    return { activities, limit, offset };
  }

  getLikes({ limit, offset }: PaginationOptions) {
    const rows = this.getLikeRows({
      whereSql: '1 = 1',
      params: [],
      limit,
      offset,
    });
    const total = (
      this.db.prepare('SELECT COUNT(*) AS count FROM like_activities').get() as CountRow | undefined
    )?.count;
    return {
      activities: rows.map((row) => this.toActivity(row)).filter((row) => row !== null),
      total: total ?? 0,
      limit,
      offset,
    };
  }

  getLikesByYear({ year, datasetId, search }: YearlyLikesOptions) {
    const params: SqliteBindValue[] = [
      `${year}-01-01T00:00:00.000Z`,
      `${year + 1}-01-01T00:00:00.000Z`,
    ];
    const where = ['la.created_at >= ?', 'la.created_at < ?'];

    if (datasetId) {
      where.push('s.dataset_id = ?');
      params.push(Number(datasetId));
    }

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      const like = `%${trimmedSearch}%`;
      where.push(`(
        s.name LIKE ? COLLATE NOCASE OR
        EXISTS (
          SELECT 1
          FROM stack_tags st
          JOIN tags t ON t.id = st.tag_id
          WHERE st.stack_id = s.id AND t.title LIKE ? COLLATE NOCASE
        )
      )`);
      params.push(like, like);
    }

    const rows = this.getLikeRows({
      whereSql: where.join(' AND '),
      params,
    });

    const groupedByMonth: Record<string, unknown[]> = {};
    for (const row of rows) {
      const monthKey = row.created_at.slice(0, 7);
      const activity = this.toActivity(row);
      if (!activity) continue;
      groupedByMonth[monthKey] ??= [];
      groupedByMonth[monthKey].push(activity);
    }

    const availableYears = (
      this.db
        .prepare(
          `SELECT DISTINCT substr(la.created_at, 1, 4) AS year
           FROM like_activities la
           JOIN stacks s ON s.id = la.stack_id
           ${datasetId ? 'WHERE s.dataset_id = ?' : ''}
           ORDER BY year DESC`
        )
        .all(...(datasetId ? [Number(datasetId)] : [])) as YearRow[]
    ).map((row) => Number(row.year));

    return {
      year,
      groupedByMonth,
      totalItems: rows.length,
      availableYears,
    };
  }

  removeLikeActivity(id: number) {
    const row = this.db.prepare('SELECT id, stack_id FROM like_activities WHERE id = ?').get(id) as
      | { id: number; stack_id: number }
      | undefined;
    if (!row) return null;

    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM like_activities WHERE id = ?').run(id);
      this.db
        .prepare(
          `UPDATE stacks
           SET liked = CASE WHEN liked > 0 THEN liked - 1 ELSE 0 END
           WHERE id = ?`
        )
        .run(row.stack_id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    const stack = this.db.prepare('SELECT liked FROM stacks WHERE id = ?').get(row.stack_id) as
      | { liked: number }
      | undefined;
    return {
      success: true,
      stackId: row.stack_id,
      liked: Math.max(stack?.liked ?? 0, 0),
    };
  }

  private getLikeRows({
    whereSql,
    params,
    limit,
    offset,
  }: {
    whereSql: string;
    params: SqliteBindValue[];
    limit?: number;
    offset?: number;
  }) {
    const paginationSql = limit !== undefined && offset !== undefined ? 'LIMIT ? OFFSET ?' : '';
    const paginationParams = limit !== undefined && offset !== undefined ? [limit, offset] : [];
    return this.db
      .prepare(
        `SELECT
           la.id,
           la.stack_id,
           la.asset_id,
           la.created_at,
           s.dataset_id,
           a.file AS asset_file,
           a.thumbnail AS asset_thumbnail,
           a.order_in_stack AS asset_order_in_stack
         FROM like_activities la
         JOIN stacks s ON s.id = la.stack_id
         LEFT JOIN assets a ON a.id = la.asset_id
         WHERE ${whereSql}
         ORDER BY la.created_at DESC
         ${paginationSql}`
      )
      .all(...params, ...paginationParams) as LikeActivityRow[];
  }

  private toActivity(row: LikeActivityRow) {
    const stack = toStackWithLikeContext(this.stackRepository.getById(row.stack_id), row);
    if (!stack) return null;
    return {
      id: row.id,
      stackId: row.stack_id,
      assetId: row.asset_id,
      likePage:
        row.asset_id && row.asset_order_in_stack !== null
          ? row.asset_order_in_stack + 1
          : undefined,
      createdAt: row.created_at,
      stack,
    };
  }
}
