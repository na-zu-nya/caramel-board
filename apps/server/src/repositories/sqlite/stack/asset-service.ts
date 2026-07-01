import type { DatabaseSync } from 'node:sqlite';
import { extractPdfOriginalsFromMeta } from '../../../utils/pdfImport';
import { nowIso, parseJsonObject } from '../sqlite';
import { placeholders } from './helpers';
import { toAsset } from './mappers';
import type { StackMediaTypeService } from './media-type-service';
import type { StackThumbnailService } from './thumbnail-service';
import type { AssetRow, OriginalAssetRow } from './types';

type StackResolver<TStack> = (id: number) => TStack | null;

type AssetMutationRow = AssetRow & {
  dataset_id: number;
  author_id: number | null;
  stack_name: string;
  media_type: string;
};

const getSeparatedAssetName = (asset: AssetMutationRow) => {
  const baseName = asset.original_name.replace(/\.[^./]+$/, '').trim();
  if (baseName.length > 0) return baseName;
  if (asset.stack_name.length > 0) return `${asset.stack_name} (Separated)`;
  return 'Separated asset';
};

export class StackAssetService {
  constructor(
    private db: DatabaseSync,
    private mediaTypeService: StackMediaTypeService,
    private thumbnailService: StackThumbnailService
  ) {}

  getAssetsByStackId(stackId: number, dataSetId: number) {
    const rows = this.db
      .prepare(
        `SELECT
           assets.*,
           CASE WHEN af.id IS NULL THEN 0 ELSE 1 END AS is_favorite,
           COALESCE(asset_likes.like_count, 0) AS like_count
         FROM assets
         JOIN stacks s ON s.id = assets.stack_id
         LEFT JOIN asset_favorites af ON af.asset_id = assets.id
         LEFT JOIN (
           SELECT asset_id, COUNT(*) AS like_count
           FROM like_activities
           WHERE asset_id IS NOT NULL
           GROUP BY asset_id
         ) asset_likes ON asset_likes.asset_id = assets.id
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
    void this.thumbnailService
      .refreshStackThumbnail(asset.stack_id)
      .catch((error) =>
        console.error(`Failed to refresh stack ${asset.stack_id} thumbnail`, error)
      );
    this.mediaTypeService.refreshStackActualMediaType(asset.stack_id);
    return true;
  }

  deleteAssets(assetIds: number[]) {
    const assets = this.getAssetsForMutation(assetIds);
    if (!assets) return null;

    const now = nowIso();
    const affectedStackIds = new Set(assets.map((asset) => asset.stack_id));

    this.db.exec('BEGIN');
    try {
      const result = this.db
        .prepare(`DELETE FROM assets WHERE id IN (${placeholders(assetIds)})`)
        .run(...assetIds);

      for (const stackId of affectedStackIds) {
        this.normalizeAssetOrder(stackId, now);
        this.db.prepare('UPDATE stacks SET updated_at = ? WHERE id = ?').run(now, stackId);
      }

      this.db.exec('COMMIT');
      this.refreshAssetMutationStacks(affectedStackIds);
      return { success: true, removed: result.changes };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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

    const name = getSeparatedAssetName(asset);
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

      void this.thumbnailService
        .refreshStackThumbnail(asset.stack_id)
        .catch((error) =>
          console.error(`Failed to refresh stack ${asset.stack_id} thumbnail`, error)
        );
      this.mediaTypeService.refreshStackActualMediaType(asset.stack_id);
      this.mediaTypeService.refreshStackActualMediaType(newStackId);
      this.db.exec('COMMIT');
      return resolveStack(newStackId);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  separateAssets<TStack>(assetIds: number[], resolveStack: StackResolver<TStack>) {
    const assets = this.getAssetsForMutation(assetIds);
    if (!assets) return null;

    const now = nowIso();
    const sourceStackIds = new Set<number>();
    const createdStackIds: number[] = [];

    this.db.exec('BEGIN');
    try {
      const insertStack = this.db.prepare(
        `INSERT INTO stacks
           (dataset_id, author_id, name, thumbnail, media_type, liked, meta_json, dominant_colors_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      );
      const moveAsset = this.db.prepare(
        'UPDATE assets SET stack_id = ?, order_in_stack = 0, updated_at = ? WHERE id = ?'
      );

      for (const asset of assets) {
        sourceStackIds.add(asset.stack_id);
        const created = insertStack.run(
          asset.dataset_id,
          asset.author_id,
          getSeparatedAssetName(asset),
          asset.thumbnail,
          asset.media_type,
          '{}',
          asset.dominant_colors_json,
          now,
          now
        );
        const newStackId = Number(created.lastInsertRowid);
        createdStackIds.push(newStackId);
        moveAsset.run(newStackId, now, asset.id);
      }

      for (const stackId of sourceStackIds) {
        this.normalizeAssetOrder(stackId, now);
        this.db.prepare('UPDATE stacks SET updated_at = ? WHERE id = ?').run(now, stackId);
      }

      this.db.exec('COMMIT');
      this.refreshAssetMutationStacks(new Set([...sourceStackIds, ...createdStackIds]));
      return createdStackIds.map((id) => resolveStack(id)).filter((stack) => stack !== null);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  createStackFromAssets<TStack>(assetIds: number[], resolveStack: StackResolver<TStack>) {
    const assets = this.getAssetsForMutation(assetIds);
    if (!assets || assets.length === 0) return null;

    const [firstAsset] = assets;
    if (assets.some((asset) => asset.stack_id !== firstAsset.stack_id)) return null;

    const now = nowIso();
    const stackName =
      assets.length === 1
        ? getSeparatedAssetName(firstAsset)
        : firstAsset.stack_name.length > 0
          ? `${firstAsset.stack_name} (Selection)`
          : 'Selected assets';

    this.db.exec('BEGIN');
    try {
      const created = this.db
        .prepare(
          `INSERT INTO stacks
             (dataset_id, author_id, name, thumbnail, media_type, liked, meta_json, dominant_colors_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
        )
        .run(
          firstAsset.dataset_id,
          firstAsset.author_id,
          stackName,
          firstAsset.thumbnail,
          firstAsset.media_type,
          '{}',
          firstAsset.dominant_colors_json,
          now,
          now
        );
      const newStackId = Number(created.lastInsertRowid);
      const moveAsset = this.db.prepare(
        'UPDATE assets SET stack_id = ?, order_in_stack = ?, updated_at = ? WHERE id = ?'
      );

      assets.forEach((asset, index) => {
        moveAsset.run(newStackId, index, now, asset.id);
      });

      this.normalizeAssetOrder(firstAsset.stack_id, now);
      this.db
        .prepare('UPDATE stacks SET updated_at = ? WHERE id = ?')
        .run(now, firstAsset.stack_id);

      this.db.exec('COMMIT');
      this.refreshAssetMutationStacks(new Set([firstAsset.stack_id, newStackId]));
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

  private getAssetsForMutation(assetIds: number[]) {
    if (assetIds.length === 0) return null;

    const rows = this.db
      .prepare(
        `SELECT assets.*, s.dataset_id, s.author_id, s.name AS stack_name, s.media_type
         FROM assets
         JOIN stacks s ON s.id = assets.stack_id
         WHERE assets.id IN (${placeholders(assetIds)})`
      )
      .all(...assetIds) as AssetMutationRow[];

    if (rows.length !== assetIds.length) return null;

    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const orderedRows: AssetMutationRow[] = [];
    for (const assetId of assetIds) {
      const row = rowsById.get(assetId);
      if (!row) return null;
      orderedRows.push(row);
    }
    return orderedRows;
  }

  private normalizeAssetOrder(stackId: number, timestamp: string) {
    const remaining = this.db
      .prepare(
        `SELECT id
         FROM assets
         WHERE stack_id = ?
         ORDER BY order_in_stack ASC, id ASC`
      )
      .all(stackId) as Array<{ id: number }>;
    const updateOrder = this.db.prepare(
      'UPDATE assets SET order_in_stack = ?, updated_at = ? WHERE id = ?'
    );
    remaining.forEach((row, index) => {
      updateOrder.run(index, timestamp, row.id);
    });
  }

  private refreshAssetMutationStacks(stackIds: Iterable<number>) {
    for (const stackId of stackIds) {
      void this.thumbnailService
        .refreshStackThumbnail(stackId)
        .catch((error) => console.error(`Failed to refresh stack ${stackId} thumbnail`, error));
      this.mediaTypeService.refreshStackActualMediaType(stackId);
    }
  }
}
