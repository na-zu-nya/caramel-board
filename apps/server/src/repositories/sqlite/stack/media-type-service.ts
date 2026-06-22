import type { DatabaseSync } from 'node:sqlite';
import { detectActualMediaTypeFromFileTypes } from './helpers';

interface AssetFileTypeRow {
  file_type: string | null;
}

interface StackIdRow {
  id: number;
}

export class StackMediaTypeService {
  constructor(private db: DatabaseSync) {}

  refreshStackActualMediaType(stackId: number) {
    const rows = this.db
      .prepare(
        'SELECT file_type FROM assets WHERE stack_id = ? ORDER BY order_in_stack ASC, id ASC'
      )
      .all(stackId) as AssetFileTypeRow[];
    const actualMediaType = detectActualMediaTypeFromFileTypes(rows.map((row) => row.file_type));
    const result = this.db
      .prepare('UPDATE stacks SET actual_media_type = ? WHERE id = ?')
      .run(actualMediaType, stackId);
    return { updated: result.changes > 0, actualMediaType };
  }

  refreshDatasetActualMediaTypes(dataSetId: number) {
    const rows = this.db
      .prepare('SELECT id FROM stacks WHERE dataset_id = ? ORDER BY id ASC')
      .all(dataSetId) as StackIdRow[];

    let updated = 0;
    for (const row of rows) {
      if (this.refreshStackActualMediaType(row.id).updated) {
        updated++;
      }
    }

    return { updated, total: rows.length };
  }
}
