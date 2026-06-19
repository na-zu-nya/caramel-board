import type { DatabaseSync } from 'node:sqlite';
import {
  type AuthorLinkInput,
  MAX_AUTHOR_LINKS,
  type NormalizedAuthorLink,
  normalizeAuthorLinkProvider,
  normalizeAuthorLinks,
} from '../shared/author-links';
import { getStandaloneSqlite } from './sqlite';
import { StandaloneStackRepository } from './stack-repository';

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

interface AuthorLinkRow {
  id: number;
  author_id: number;
  provider: string | null;
  label: string;
  url: string;
  external_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
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

const mapAuthorLink = (link: AuthorLinkRow) => ({
  id: link.id,
  authorId: link.author_id,
  provider: link.provider,
  label: link.label,
  url: link.url,
  externalId: link.external_id,
  sortOrder: link.sort_order,
  createdAt: link.created_at,
  updatedAt: link.updated_at,
});

const linkDedupKey = (link: Pick<AuthorLinkRow, 'provider' | 'external_id' | 'url'>) =>
  link.provider && link.external_id ? `${link.provider}:${link.external_id}` : `url:${link.url}`;

export class StandaloneMetadataRepository {
  constructor(private db: DatabaseSync = getStandaloneSqlite()) {}

  private getLinksByAuthorIds(authorIds: number[]) {
    if (authorIds.length === 0) return new Map<number, ReturnType<typeof mapAuthorLink>[]>();
    const placeholders = authorIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT id, author_id, provider, label, url, external_id, sort_order, created_at, updated_at
         FROM author_links
         WHERE author_id IN (${placeholders})
         ORDER BY sort_order ASC, id ASC`
      )
      .all(...authorIds) as AuthorLinkRow[];
    const linksByAuthor = new Map<number, ReturnType<typeof mapAuthorLink>[]>();
    for (const row of rows) {
      const links = linksByAuthor.get(row.author_id) ?? [];
      links.push(mapAuthorLink(row));
      linksByAuthor.set(row.author_id, links);
    }
    return linksByAuthor;
  }

  private replaceLinks(authorId: number, links: NormalizedAuthorLink[]) {
    const now = new Date().toISOString();
    this.db.prepare('DELETE FROM author_links WHERE author_id = ?').run(authorId);
    const statement = this.db.prepare(
      `INSERT INTO author_links
       (author_id, provider, label, url, external_id, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const link of links.slice(0, MAX_AUTHOR_LINKS)) {
      statement.run(
        authorId,
        link.provider,
        link.label,
        link.url,
        link.externalId,
        link.sortOrder,
        now,
        now
      );
    }
  }

  private buildAuthorResult(author: { id: number; dataset_id: number; name: string }) {
    const countRow = this.db
      .prepare('SELECT COUNT(*) AS count FROM stacks WHERE author_id = ?')
      .get(author.id) as CountRow | undefined;
    const linksByAuthor = this.getLinksByAuthorIds([author.id]);
    return {
      id: author.id,
      dataSetId: author.dataset_id,
      name: author.name,
      stackCount: countRow?.count ?? 0,
      links: linksByAuthor.get(author.id) ?? [],
    };
  }

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
    const linksByAuthor = this.getLinksByAuthorIds(rows.map((author) => author.id));

    return {
      authors: rows.map((author) => ({
        id: author.id,
        dataSetId: author.dataset_id,
        name: author.name,
        stackCount: author.stack_count,
        links: linksByAuthor.get(author.id) ?? [],
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
        `SELECT DISTINCT a.id, a.name
         FROM authors a
         LEFT JOIN author_links al ON al.author_id = a.id
         WHERE a.dataset_id = ?
          AND (
            a.name LIKE ? COLLATE NOCASE
            OR al.external_id LIKE ? COLLATE NOCASE
            OR al.url LIKE ? COLLATE NOCASE
          )
         ORDER BY name ASC
         LIMIT 10`
      )
      .all(datasetId, `%${key}%`, `%${key}%`, `%${key}%`) as Array<{
      id: number;
      name: string;
    }>;
    return rows;
  }

  getAuthor(id: number, datasetId: number) {
    const author = this.db
      .prepare('SELECT id, dataset_id, name FROM authors WHERE id = ? AND dataset_id = ?')
      .get(id, datasetId) as { id: number; dataset_id: number; name: string } | undefined;
    return author ? this.buildAuthorResult(author) : null;
  }

  updateAuthor(id: number, datasetId: number, input: { name?: string; links?: AuthorLinkInput[] }) {
    const normalizedName = input.name?.trim();
    const normalizedLinks = input.links ? normalizeAuthorLinks(input.links) : undefined;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db
        .prepare('SELECT id, dataset_id, name FROM authors WHERE id = ? AND dataset_id = ?')
        .get(id, datasetId) as { id: number; dataset_id: number; name: string } | undefined;
      if (!existing) {
        this.db.exec('ROLLBACK');
        return null;
      }
      if (normalizedName && normalizedName !== existing.name) {
        this.db.prepare('UPDATE authors SET name = ? WHERE id = ?').run(normalizedName, id);
        existing.name = normalizedName;
      }
      if (normalizedLinks) {
        this.replaceLinks(id, normalizedLinks);
      }
      this.db.exec('COMMIT');
      return this.buildAuthorResult(existing);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  addAuthorLink(id: number, datasetId: number, input: AuthorLinkInput) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const author = this.db
        .prepare('SELECT id, dataset_id, name FROM authors WHERE id = ? AND dataset_id = ?')
        .get(id, datasetId) as { id: number; dataset_id: number; name: string } | undefined;
      if (!author) {
        this.db.exec('ROLLBACK');
        return null;
      }
      const current = this.getLinksByAuthorIds([id]).get(id) ?? [];
      if (current.length >= MAX_AUTHOR_LINKS) {
        throw new Error(`Author links can contain at most ${MAX_AUTHOR_LINKS} entries`);
      }
      const [link] = normalizeAuthorLinks([input]).map((entry) => ({
        ...entry,
        sortOrder: current.length,
      }));
      this.replaceLinks(
        id,
        [
          ...current.map((entry, index) => ({
            provider: normalizeAuthorLinkProvider(entry.provider),
            label: entry.label,
            url: entry.url,
            externalId: entry.externalId,
            sortOrder: index,
          })),
          link,
        ].slice(0, MAX_AUTHOR_LINKS)
      );
      this.db.exec('COMMIT');
      return this.buildAuthorResult(author);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  mergeAuthors(datasetId: number, targetAuthorId: number, sourceAuthorIds: number[]) {
    const sourceIds = [...new Set(sourceAuthorIds.filter((id) => id !== targetAuthorId))];
    if (sourceIds.length === 0) return this.getAuthor(targetAuthorId, datasetId);

    const placeholders = [targetAuthorId, ...sourceIds].map(() => '?').join(', ');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const authors = this.db
        .prepare(
          `SELECT id, dataset_id, name
           FROM authors
           WHERE dataset_id = ? AND id IN (${placeholders})`
        )
        .all(datasetId, targetAuthorId, ...sourceIds) as Array<{
        id: number;
        dataset_id: number;
        name: string;
      }>;
      const target = authors.find((author) => author.id === targetAuthorId);
      if (!target) {
        this.db.exec('ROLLBACK');
        return null;
      }
      const validSourceIds = authors
        .filter((author) => sourceIds.includes(author.id))
        .map((author) => author.id);
      if (validSourceIds.length === 0) {
        this.db.exec('COMMIT');
        return this.buildAuthorResult(target);
      }

      const linksByAuthor = this.getLinksByAuthorIds([targetAuthorId, ...validSourceIds]);
      const mergedLinks: NormalizedAuthorLink[] = [];
      const seenLinks = new Set<string>();
      for (const authorId of [targetAuthorId, ...validSourceIds]) {
        for (const link of linksByAuthor.get(authorId) ?? []) {
          const key = linkDedupKey({
            provider: link.provider,
            external_id: link.externalId,
            url: link.url,
          });
          if (seenLinks.has(key) || mergedLinks.length >= MAX_AUTHOR_LINKS) continue;
          seenLinks.add(key);
          mergedLinks.push({
            provider: normalizeAuthorLinkProvider(link.provider),
            label: link.label,
            url: link.url,
            externalId: link.externalId,
            sortOrder: mergedLinks.length,
          });
        }
      }

      const sourcePlaceholders = validSourceIds.map(() => '?').join(', ');
      this.db
        .prepare(
          `UPDATE stacks SET author_id = ?, updated_at = ? WHERE author_id IN (${sourcePlaceholders})`
        )
        .run(targetAuthorId, new Date().toISOString(), ...validSourceIds);
      this.db
        .prepare(`DELETE FROM authors WHERE id IN (${sourcePlaceholders})`)
        .run(...validSourceIds);
      this.replaceLinks(targetAuthorId, mergedLinks);
      this.db.exec('COMMIT');
      return this.buildAuthorResult(target);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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

  getStacksByTag(id: number, datasetId: number, options: PaginationOptions) {
    const tag = this.db
      .prepare('SELECT title FROM tags WHERE id = ? AND dataset_id = ?')
      .get(id, datasetId) as { title: string } | undefined;
    if (!tag) {
      return { stacks: [], total: 0, limit: options.limit, offset: options.offset };
    }
    return new StandaloneStackRepository(this.db).getPaginated({
      dataSetId: datasetId,
      tag: tag.title,
      limit: options.limit,
      offset: options.offset,
    });
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
