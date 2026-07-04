import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../../repositories/sqlite/sqlite';
import { isImageExtension } from '../../repositories/sqlite/stack/helpers';
import { readAssetDimensions } from '../../utils/assetDimensions';
import type { MaintenanceTask, MaintenanceTaskContext, MaintenanceTaskResult } from '../types';

interface PendingAssetRow {
  id: number;
  file: string;
  file_type: string;
}

const PROGRESS_BATCH_SIZE = 10;

const findPendingImageAssets = (db: DatabaseSync): PendingAssetRow[] => {
  const rows = db
    .prepare('SELECT id, file, file_type FROM assets WHERE width IS NULL OR height IS NULL')
    .all() as PendingAssetRow[];
  // Video files can't be read by sharp, so only images are eligible for this backfill.
  return rows.filter((row) => isImageExtension(row.file_type));
};

export const backfillAssetDimensionsTask: MaintenanceTask = {
  id: 'backfill-asset-dimensions',
  title: 'Backfill asset dimensions',
  description:
    'Reads image dimensions for assets that were imported before dimension tracking existed and fills in the missing width/height values.',
  autoRun: true,

  countPending(db: DatabaseSync): number {
    return findPendingImageAssets(db).length;
  },

  async run(ctx: MaintenanceTaskContext): Promise<MaintenanceTaskResult> {
    const { db, reportProgress } = ctx;
    const pending = findPendingImageAssets(db);
    const total = pending.length;
    let processed = 0;
    let failed = 0;

    reportProgress(0, total);

    for (const asset of pending) {
      const dimensions = await readAssetDimensions(asset.file);
      if (dimensions.width !== null && dimensions.height !== null) {
        db.prepare('UPDATE assets SET width = ?, height = ?, updated_at = ? WHERE id = ?').run(
          dimensions.width,
          dimensions.height,
          nowIso(),
          asset.id
        );
      } else {
        failed++;
        console.error(`Failed to read dimensions for asset ${asset.id} (${asset.file})`);
      }

      processed++;
      if (processed % PROGRESS_BATCH_SIZE === 0 || processed === total) {
        reportProgress(processed, total);
      }
    }

    return { processed, total, failed };
  },
};
