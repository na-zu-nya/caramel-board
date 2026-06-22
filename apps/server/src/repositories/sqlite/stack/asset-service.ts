import type { DatabaseSync } from 'node:sqlite';
import { extractPdfOriginalsFromMeta } from '../../../utils/pdfImport';
import { nowIso, parseJsonObject } from '../sqlite';
import { placeholders } from './helpers';
import { toAsset } from './mappers';
import type { StackThumbnailService } from './thumbnail-service';
import type { AssetRow, OriginalAssetRow } from './types';

type StackResolver<TStack> = (id: number) => TStack | null;

export class StackAssetService {
  constructor(
    private db: DatabaseSync,
    private thumbnailService: StackThumbnailService
  ) {}

  getAssetsByStackId(stackId: number, dataSetId: number) {
    const rows = this.db
      .prepare(
        `SELECT
           assets.*,
           CASE WHEN af.id IS NULL THEN 0 ELSE 1 END AS is_favorite
         FROM assets
         JOIN stacks s ON s.id = assets.stack_id
         LEFT JOIN asset_favorites af ON af.asset_id = assets.id
         WHERE assets.stack_id = ? AND s.dataset_id = ?
         ORDER BY assets.order_in_stack ASC, assets.id ASC`
      )
      .all(stackId, dataSetId) as AssetRow[];

    return rows.map((row) => toAsset(row, dataSetId));
  }

  getOriginalAssets(dataSetId: number, options: { stackIds: number[]; assetIds: number[] }) {
    const selectedAssets =
      options.assetIds.length > 0
        ? (this.db
            .prepare(
              `SELECT a.id, a.stack_id, a.file, a.file_type, a.original_name
               FROM assets a
               JOIN stacks s ON s.id = a.stack_id
               WHERE s.dataset_id = ?
                 AND a.id IN (${placeholders(options.assetIds)})`
            )
            .all(dataSetId, ...options.assetIds) as OriginalAssetRow[])
        : [];
    const assetsById = new Map(selectedAssets.map((asset) => [asset.id, asset]));

    const stackAssets =
      options.stackIds.length > 0
        ? (this.db
            .prepare(
              `SELECT a.id, a.stack_id, a.file, a.file_type, a.original_name
               FROM assets a
               JOIN stacks s ON s.id = a.stack_id
               WHERE s.dataset_id = ?
                 AND a.stack_id IN (${placeholders(options.stackIds)})
               ORDER BY a.stack_id ASC, a.order_in_stack ASC, a.id ASC`
            )
            .all(dataSetId, ...options.stackIds) as OriginalAssetRow[])
        : [];
    const assetsByStackId = new Map<number, OriginalAssetRow[]>();
    for (const asset of stackAssets) {
      const current = assetsByStackId.get(asset.stack_id) ?? [];
      current.push(asset);
      assetsByStackId.set(asset.stack_id, current);
    }

    const orderedAssets: OriginalAssetRow[] = [];
    for (const assetId of options.assetIds) {
      const asset = assetsById.get(assetId);
      if (asset) orderedAssets.push(asset);
    }
    const ordered = orderedAssets.map((asset) => ({
      id: asset.id,
      stackId: asset.stack_id,
      file: asset.file,
      fileType: asset.file_type,
      originalName: asset.original_name,
    }));

    const stackMetaRows =
      options.stackIds.length > 0
        ? (this.db
            .prepare(
              `SELECT id, meta_json
               FROM stacks
               WHERE dataset_id = ?
                 AND id IN (${placeholders(options.stackIds)})`
            )
            .all(dataSetId, ...options.stackIds) as Array<{
            id: number;
            meta_json: string | null;
          }>)
        : [];
    const pdfsByStackId = new Map(
      stackMetaRows.map((row) => [
        row.id,
        extractPdfOriginalsFromMeta(parseJsonObject(row.meta_json)),
      ])
    );

    for (const stackId of options.stackIds) {
      ordered.push(
        ...(assetsByStackId.get(stackId) ?? []).map((asset) => ({
          id: asset.id,
          stackId: asset.stack_id,
          file: asset.file,
          fileType: asset.file_type,
          originalName: asset.original_name,
        }))
      );
      for (const pdf of pdfsByStackId.get(stackId) ?? []) {
        ordered.push({
          id: -stackId,
          stackId,
          file: pdf.file,
          fileType: pdf.mimeType,
          originalName: pdf.originalName,
        });
      }
    }

    return ordered;
  }

  updateAssetMeta(assetId: number, dataSetId: number, meta: Record<string, unknown>) {
    const result = this.db
      .prepare(
        `UPDATE assets
         SET meta_json = ?, updated_at = ?
         WHERE id = ? AND stack_id IN (SELECT id FROM stacks WHERE dataset_id = ?)`
      )
      .run(JSON.stringify(meta), nowIso(), assetId, dataSetId);
    if (result.changes === 0) return null;
    return { success: true, meta };
  }

  updateAssetOrder(assetId: number, order: number) {
    const asset = this.getAssetWithDataset(assetId);
    if (!asset) return false;
    this.db
      .prepare('UPDATE assets SET order_in_stack = ?, updated_at = ? WHERE id = ?')
      .run(order, nowIso(), assetId);
    return true;
  }

  deleteAsset(assetId: number) {
    const asset = this.getAssetWithDataset(assetId);
    if (!asset) return false;
    this.db.prepare('DELETE FROM assets WHERE id = ?').run(assetId);
    this.thumbnailService.refreshStackThumbnail(asset.stack_id);
    return true;
  }

  separateAsset<TStack>(assetId: number, resolveStack: StackResolver<TStack>) {
    const asset = this.db
      .prepare(
        `SELECT assets.*, s.dataset_id, s.author_id, s.name AS stack_name, s.media_type
         FROM assets
         JOIN stacks s ON s.id = assets.stack_id
         WHERE assets.id = ?`
      )
      .get(assetId) as
      | (AssetRow & {
          dataset_id: number;
          author_id: number | null;
          stack_name: string;
          media_type: string;
        })
      | undefined;
    if (!asset) return null;

    const baseName = asset.original_name.replace(/\.[^./]+$/, '').trim();
    const name = baseName.length
      ? baseName
      : asset.stack_name.length
        ? `${asset.stack_name} (Separated)`
        : 'Separated asset';
    const now = nowIso();

    this.db.exec('BEGIN');
    try {
      const created = this.db
        .prepare(
          `INSERT INTO stacks
             (dataset_id, author_id, name, thumbnail, media_type, liked, meta_json, dominant_colors_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
        )
        .run(
          asset.dataset_id,
          asset.author_id,
          name,
          asset.thumbnail,
          asset.media_type,
          '{}',
          asset.dominant_colors_json,
          now,
          now
        );
      const newStackId = Number(created.lastInsertRowid);

      this.db
        .prepare('UPDATE assets SET stack_id = ?, order_in_stack = 0, updated_at = ? WHERE id = ?')
        .run(newStackId, now, assetId);

      const remaining = this.db
        .prepare(
          `SELECT id
           FROM assets
           WHERE stack_id = ?
           ORDER BY order_in_stack ASC, id ASC`
        )
        .all(asset.stack_id) as Array<{ id: number }>;
      const updateOrder = this.db.prepare(
        'UPDATE assets SET order_in_stack = ?, updated_at = ? WHERE id = ?'
      );
      remaining.forEach((row, index) => {
        updateOrder.run(index, now, row.id);
      });

      this.thumbnailService.refreshStackThumbnail(asset.stack_id);
      this.db.exec('COMMIT');
      return resolveStack(newStackId);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private getAssetWithDataset(assetId: number) {
    return this.db
      .prepare(
        `SELECT assets.id, assets.stack_id, s.dataset_id
         FROM assets
         JOIN stacks s ON s.id = assets.stack_id
         WHERE assets.id = ?`
      )
      .get(assetId) as { id: number; stack_id: number; dataset_id: number } | undefined;
  }
}
