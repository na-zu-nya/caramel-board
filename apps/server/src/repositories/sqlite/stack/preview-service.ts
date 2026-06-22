import type { DatabaseSync } from 'node:sqlite';
import { generateMediaPreview, shouldGeneratePreview } from '../../../utils/generateMediaPreview';
import { nowIso } from '../sqlite';
import { getStackDataset } from './helpers';
import type { AssetPreviewRow } from './types';

export class StackPreviewService {
  constructor(private db: DatabaseSync) {}

  async regeneratePreviews(stackId: number, dataSetId: number, options: { force?: boolean } = {}) {
    const stack = getStackDataset(this.db, stackId);
    if (!stack || stack.dataset_id !== dataSetId) return null;

    const assets = this.db
      .prepare(
        `SELECT id, file, file_type, hash, preview
         FROM assets
         WHERE stack_id = ?
         ORDER BY order_in_stack ASC, id ASC`
      )
      .all(stackId) as AssetPreviewRow[];
    const force = options.force ?? true;
    const eligibleAssets = assets.filter((asset) => shouldGeneratePreview(asset.file_type));
    const results: Array<{ assetId: number; preview: string | null }> = [];
    const failures: number[] = [];

    for (const asset of eligibleAssets) {
      try {
        const previewKey = await generateMediaPreview(
          asset.file,
          asset.hash,
          asset.file_type.toLowerCase(),
          { dataSetId, force }
        );

        if (previewKey) {
          this.db
            .prepare('UPDATE assets SET preview = ?, updated_at = ? WHERE id = ?')
            .run(previewKey, nowIso(), asset.id);
          results.push({ assetId: asset.id, preview: previewKey });
        } else {
          if (force && !asset.preview) {
            this.db
              .prepare('UPDATE assets SET preview = NULL, updated_at = ? WHERE id = ?')
              .run(nowIso(), asset.id);
          }
          results.push({ assetId: asset.id, preview: asset.preview ?? null });
        }
      } catch (error) {
        failures.push(asset.id);
        console.error(`Failed to regenerate preview for asset ${asset.id}`, error);
        results.push({ assetId: asset.id, preview: asset.preview ?? null });
      }
    }

    return {
      success: failures.length === 0,
      totalAssets: assets.length,
      eligible: eligibleAssets.length,
      regenerated: results.filter((entry) => entry.preview).length,
      failed: failures,
      previews: results,
    };
  }
}
