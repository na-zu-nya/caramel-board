import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../sqlite';
import type { StackFavoriteService } from './favorite-service';
import { getStackDataset, placeholders } from './helpers';
import type { StackMediaTypeService } from './media-type-service';
import type { StackMetadataService } from './metadata-service';
import type { StackThumbnailService } from './thumbnail-service';
import type { CountRow, StackDatasetRow } from './types';

type StackResolver<TStack> = (id: number) => TStack | null;

export class StackBulkService {
  constructor(
    private db: DatabaseSync,
    private mediaTypeService: StackMediaTypeService,
    private metadataService: StackMetadataService,
    private favoriteService: StackFavoriteService,
    private thumbnailService: StackThumbnailService
  ) {}

  deleteStack(stackId: number) {
    const result = this.db.prepare('DELETE FROM stacks WHERE id = ?').run(stackId);
    return result.changes > 0;
  }

  bulkAddTags(stackIds: number[], tags: string[]) {
    let updated = 0;
    for (const stackId of stackIds) {
      let changed = false;
      for (const tag of tags) {
        if (this.metadataService.addTag(stackId, tag)) changed = true;
      }
      if (changed) updated++;
    }
    return { success: true, updated };
  }

  bulkSetAuthor(stackIds: number[], author: string) {
    let updated = 0;
    for (const stackId of stackIds) {
      if (this.metadataService.updateAuthor(stackId, author)) updated++;
    }
    return { success: true, updated };
  }

  bulkSetMediaType(stackIds: number[], mediaType: 'image' | 'comic' | 'video') {
    if (stackIds.length === 0) return { success: true, updated: 0 };
    const result = this.db
      .prepare(
        `UPDATE stacks
         SET media_type = ?, updated_at = ?
         WHERE id IN (${placeholders(stackIds)})`
      )
      .run(mediaType, nowIso(), ...stackIds);
    return { success: true, updated: result.changes };
  }

  bulkSetFavorite(stackIds: number[], favorited: boolean) {
    let updated = 0;
    for (const stackId of stackIds) {
      if (this.favoriteService.toggleStackFavorite(stackId, favorited)) updated++;
    }
    return { success: true, updated };
  }

  async bulkRefreshThumbnails(stackIds: number[]) {
    let updated = 0;
    let eligible = 0;
    let regenerated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const stackId of stackIds) {
      const result = await this.thumbnailService.regenerateAssetThumbnails(stackId, {
        force: true,
      });
      if (result) {
        this.mediaTypeService.refreshStackActualMediaType(stackId);
        eligible += result.eligible;
        regenerated += result.regenerated;
        skipped += result.skipped;
        failed += result.failed.length;
        updated++;
        if (!result.success) {
          errors.push(`Stack ${stackId} thumbnail refresh failed`);
        }
      } else {
        errors.push(`Stack ${stackId} not found`);
      }
    }
    return {
      success: errors.length === 0,
      updated,
      errors,
      thumbnails: {
        eligible,
        regenerated,
        skipped,
        failures: failed,
      },
    };
  }

  bulkRemoveStacks(stackIds: number[]) {
    let removed = 0;
    const errors: string[] = [];
    for (const stackId of stackIds) {
      if (this.deleteStack(stackId)) {
        removed++;
      } else {
        errors.push(`Stack ${stackId} not found`);
      }
    }
    return { success: errors.length === 0, removed, errors };
  }

  mergeStacks<TStack>(targetId: number, sourceIds: number[], resolveStack: StackResolver<TStack>) {
    const target = getStackDataset(this.db, targetId);
    if (!target) return null;
    const sources = sourceIds
      .map((sourceId) => getStackDataset(this.db, sourceId))
      .filter((source): source is StackDatasetRow => Boolean(source));
    if (sources.length !== sourceIds.length) return null;
    if (sources.some((source) => source.dataset_id !== target.dataset_id)) {
      throw new Error('Stacks belong to multiple datasets');
    }

    const now = nowIso();
    this.db.exec('BEGIN');
    try {
      const maxOrder =
        (
          this.db
            .prepare(
              'SELECT COALESCE(MAX(order_in_stack), -1) AS count FROM assets WHERE stack_id = ?'
            )
            .get(targetId) as CountRow | undefined
        )?.count ?? -1;
      let nextOrder = maxOrder + 1;
      const sourceAssetRows = this.db
        .prepare(
          `SELECT id
           FROM assets
           WHERE stack_id IN (${placeholders(sourceIds)})
           ORDER BY stack_id ASC, order_in_stack ASC, id ASC`
        )
        .all(...sourceIds) as Array<{ id: number }>;
      const updateAsset = this.db.prepare(
        'UPDATE assets SET stack_id = ?, order_in_stack = ?, updated_at = ? WHERE id = ?'
      );
      for (const asset of sourceAssetRows) {
        updateAsset.run(targetId, nextOrder, now, asset.id);
        nextOrder++;
      }

      const sourceTagRows = this.db
        .prepare(
          `SELECT DISTINCT tag_id
           FROM stack_tags
           WHERE stack_id IN (${placeholders(sourceIds)})`
        )
        .all(...sourceIds) as Array<{ tag_id: number }>;
      const insertTag = this.db.prepare(
        'INSERT OR IGNORE INTO stack_tags (stack_id, tag_id) VALUES (?, ?)'
      );
      for (const row of sourceTagRows) {
        insertTag.run(targetId, row.tag_id);
      }

      const sourceCollectionRows = this.db
        .prepare(
          `SELECT DISTINCT collection_id
           FROM collection_stacks
           WHERE stack_id IN (${placeholders(sourceIds)})`
        )
        .all(...sourceIds) as Array<{ collection_id: number }>;
      const insertCollection = this.db.prepare(
        `INSERT OR IGNORE INTO collection_stacks (collection_id, stack_id, added_at, order_index)
         VALUES (?, ?, ?, 0)`
      );
      for (const row of sourceCollectionRows) {
        insertCollection.run(row.collection_id, targetId, now);
      }

      this.db
        .prepare(`DELETE FROM stacks WHERE id IN (${placeholders(sourceIds)})`)
        .run(...sourceIds);
      void this.thumbnailService
        .refreshStackThumbnail(targetId)
        .catch((error) => console.error(`Failed to refresh stack ${targetId} thumbnail`, error));
      this.mediaTypeService.refreshStackActualMediaType(targetId);
      this.db.prepare('UPDATE stacks SET updated_at = ? WHERE id = ?').run(now, targetId);
      this.db.exec('COMMIT');
      return resolveStack(targetId);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
