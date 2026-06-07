import type { DatabaseSync } from 'node:sqlite';
import { getStandaloneSqlite } from './sqlite';

export interface PaginationOptions {
  limit: number;
  offset: number;
}

interface AuthorRow {
  id: number;
  dataset_id: number;
  name: string;
  stack_count: number;
}

interface TagRow {
  id: number;
  dataset_id: number;
  title: string;
  stack_count: number;
}

interface CountRow {
  count: number;
}

const getTotal = (db: DatabaseSync, table: 'authors' | 'tags', datasetId: number) => {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE dataset_id = ?`)
    .get(datasetId) as CountRow | undefined;
  return row?.count ?? 0;
};

export class StandaloneMetadataRepository {
  constructor(private db: DatabaseSync = getStandaloneSqlite()) {}

  getAuthors(options: PaginationOptions & { datasetId: number }) {
    const rows = this.db
      .prepare(
        `SELECT a.id, a.dataset_id, a.name, COUNT(s.id) AS stack_count
         FROM authors a
         LEFT JOIN stacks s ON s.author_id = a.id
         WHERE a.dataset_id = ?
         GROUP BY a.id
         ORDER BY a.name ASC
         LIMIT ? OFFSET ?`
      )
      .all(options.datasetId, options.limit, options.offset) as AuthorRow[];

    return {
      authors: rows.map((author) => ({
        id: author.id,
        dataSetId: author.dataset_id,
        name: author.name,
        stackCount: author.stack_count,
      })),
      total: getTotal(this.db, 'authors', options.datasetId),
      limit: options.limit,
      offset: options.offset,
    };
  }

  searchAuthors(key: string, datasetId: number) {
    if (!key) return [];
    const rows = this.db
      .prepare(
        `SELECT name
         FROM authors
         WHERE dataset_id = ? AND name LIKE ? COLLATE NOCASE
         ORDER BY name ASC
         LIMIT 10`
      )
      .all(datasetId, `%${key}%`) as Array<{ name: string }>;
    return rows.map((author) => author.name);
  }

  getTags(
    options: PaginationOptions & {
      datasetId: number;
      orderBy?: string;
      orderDirection?: string;
    }
  ) {
    const direction = options.orderDirection === 'desc' ? 'DESC' : 'ASC';
    const orderBy = options.orderBy === 'stackCount' ? 'stack_count' : 'title';
    const rows = this.db
      .prepare(
        `SELECT t.id, t.dataset_id, t.title, COUNT(st.stack_id) AS stack_count
         FROM tags t
         LEFT JOIN stack_tags st ON st.tag_id = t.id
         WHERE t.dataset_id = ?
         GROUP BY t.id
         ORDER BY ${orderBy} ${direction}, t.title ASC
         LIMIT ? OFFSET ?`
      )
      .all(options.datasetId, options.limit, options.offset) as TagRow[];

    return {
      tags: rows.map((tag) => ({
        id: tag.id,
        dataSetId: tag.dataset_id,
        title: tag.title,
        stackCount: tag.stack_count,
      })),
      total: getTotal(this.db, 'tags', options.datasetId),
      limit: options.limit,
      offset: options.offset,
    };
  }

  searchTags(key: string, datasetId: number) {
    if (!key) return [];
    return this.db
      .prepare(
        `SELECT id, title
         FROM tags
         WHERE dataset_id = ? AND title LIKE ? COLLATE NOCASE
         ORDER BY title ASC
         LIMIT 10`
      )
      .all(datasetId, `%${key}%`) as Array<{ id: number; title: string }>;
  }

  createTag(datasetId: number, title: string) {
    const existing = this.db
      .prepare(
        'SELECT id, dataset_id, title, 0 AS stack_count FROM tags WHERE dataset_id = ? AND title = ?'
      )
      .get(datasetId, title) as TagRow | undefined;
    if (existing) {
      return {
        id: existing.id,
        dataSetId: existing.dataset_id,
        title: existing.title,
      };
    }

    const result = this.db
      .prepare('INSERT INTO tags (dataset_id, title) VALUES (?, ?)')
      .run(datasetId, title);
    return {
      id: Number(result.lastInsertRowid),
      dataSetId: datasetId,
      title,
    };
  }

  renameTag(id: number, datasetId: number, title: string) {
    const result = this.db
      .prepare('UPDATE tags SET title = ? WHERE id = ? AND dataset_id = ?')
      .run(title, id, datasetId);
    if (result.changes === 0) return null;
    return { id, dataSetId: datasetId, title };
  }

  deleteTag(id: number, datasetId: number) {
    const result = this.db
      .prepare('DELETE FROM tags WHERE id = ? AND dataset_id = ?')
      .run(id, datasetId);
    return result.changes > 0;
  }

  tagStack(stackId: number, datasetId: number, tagIds: number[]) {
    const stack = this.db
      .prepare('SELECT id FROM stacks WHERE id = ? AND dataset_id = ?')
      .get(stackId, datasetId);
    if (!stack) return false;

    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM stack_tags WHERE stack_id = ?').run(stackId);
      const insert = this.db.prepare(
        'INSERT OR IGNORE INTO stack_tags (stack_id, tag_id) VALUES (?, ?)'
      );
      for (const tagId of tagIds) {
        insert.run(stackId, tagId);
      }
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  mergeTags(datasetId: number, sourceTagIds: number[], targetTagId: number) {
    this.db.exec('BEGIN');
    try {
      const stackRows = this.db
        .prepare(
          `SELECT DISTINCT st.stack_id AS stack_id
           FROM stack_tags st
           JOIN stacks s ON s.id = st.stack_id
           WHERE s.dataset_id = ? AND st.tag_id IN (${sourceTagIds.map(() => '?').join(',')})`
        )
        .all(datasetId, ...sourceTagIds) as Array<{ stack_id: number }>;
      const insert = this.db.prepare(
        'INSERT OR IGNORE INTO stack_tags (stack_id, tag_id) VALUES (?, ?)'
      );
      for (const row of stackRows) {
        insert.run(row.stack_id, targetTagId);
      }
      const deleteAssociations = this.db.prepare(
        `DELETE FROM stack_tags WHERE tag_id IN (${sourceTagIds.map(() => '?').join(',')})`
      );
      deleteAssociations.run(...sourceTagIds);
      const deleteTags = this.db.prepare(
        `DELETE FROM tags WHERE dataset_id = ? AND id IN (${sourceTagIds.map(() => '?').join(',')})`
      );
      deleteTags.run(datasetId, ...sourceTagIds);
      this.db.exec('COMMIT');
      return { success: true, affectedStacks: stackRows.length };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
