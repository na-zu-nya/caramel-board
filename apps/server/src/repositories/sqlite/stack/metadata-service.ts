import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../sqlite';
import { getStackDataset } from './helpers';
import type { AuthorLinkRow, TagRow } from './types';

export class StackMetadataService {
  constructor(private db: DatabaseSync) {}

  addTag(stackId: number, tagTitle: string) {
    const stack = getStackDataset(this.db, stackId);
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
    const stack = getStackDataset(this.db, stackId);
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
    const stack = getStackDataset(this.db, stackId);
    if (!stack) return null;
    if (!name || name.trim() === '') {
      this.db
        .prepare('UPDATE stacks SET author_id = NULL, updated_at = ? WHERE id = ?')
        .run(nowIso(), stackId);
      return { success: true, author: null };
    }

    const authorId = this.findOrCreateAuthor(stack.dataset_id, name);
    this.db
      .prepare('UPDATE stacks SET author_id = ?, updated_at = ? WHERE id = ?')
      .run(authorId, nowIso(), stackId);
    return { success: true, author: name };
  }

  findOrCreateAuthor(dataSetId: number, name: string) {
    const existing = this.db
      .prepare('SELECT id FROM authors WHERE dataset_id = ? AND name = ? COLLATE NOCASE')
      .get(dataSetId, name) as { id: number } | undefined;
    if (existing) return existing.id;
    return Number(
      this.db.prepare('INSERT INTO authors (dataset_id, name) VALUES (?, ?)').run(dataSetId, name)
        .lastInsertRowid
    );
  }

  getAuthorLinks(authorId: number | null) {
    if (authorId === null) return [];
    const rows = this.db
      .prepare(
        `SELECT id, author_id, provider, label, url, external_id, sort_order, created_at, updated_at
         FROM author_links
         WHERE author_id = ?
         ORDER BY sort_order ASC, id ASC`
      )
      .all(authorId) as AuthorLinkRow[];
    return rows.map((link) => ({
      id: link.id,
      authorId: link.author_id,
      provider: link.provider,
      label: link.label,
      url: link.url,
      externalId: link.external_id,
      sortOrder: link.sort_order,
      createdAt: link.created_at,
      updatedAt: link.updated_at,
    }));
  }

  getTagsByStackId(stackId: number) {
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
}
