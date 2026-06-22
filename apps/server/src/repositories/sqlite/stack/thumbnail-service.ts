import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../sqlite';

export class StackThumbnailService {
  constructor(private db: DatabaseSync) {}

  refreshStackThumbnail(stackId: number) {
    const asset = this.db
      .prepare(
        `SELECT thumbnail
         FROM assets
         WHERE stack_id = ?
         ORDER BY order_in_stack ASC, id ASC
         LIMIT 1`
      )
      .get(stackId) as { thumbnail: string } | undefined;
    const result = this.db
      .prepare('UPDATE stacks SET thumbnail = ?, updated_at = ? WHERE id = ?')
      .run(asset?.thumbnail ?? '', nowIso(), stackId);
    return result.changes > 0;
  }
}
