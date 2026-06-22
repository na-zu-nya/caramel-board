import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DataStorage } from '../../../lib/DataStorage';
import { readAssetDimensions } from '../../../utils/assetDimensions';
import { buildStackFrameThumbnailKey } from '../../../utils/assetPath';
import { generateThumbnail } from '../../../utils/generateThumbnail';
import { nowIso, parseJsonObject } from '../sqlite';
import {
  canonicalizeExtension,
  getStackDataset,
  isImageExtension,
  isImageFileType,
  isVideoExtension,
  isVideoFileType,
} from './helpers';
import type { AssetThumbnailRow } from './types';

interface RefreshAssetThumbnailOptions {
  force?: boolean;
}

export interface SetStackThumbnailSourceInput {
  assetId: number;
  pageNumber?: number;
  timeSeconds?: number;
}

type StackThumbnailSource =
  | {
      kind: 'asset';
      assetId: number;
      pageNumber: number;
    }
  | {
      kind: 'videoFrame';
      assetId: number;
      pageNumber: number;
      timeSeconds: number;
    };

interface ResolvedThumbnailAsset {
  asset: AssetThumbnailRow;
  extension: string;
}

interface StackThumbnailMetaRow {
  dataset_id: number;
  thumbnail: string;
  meta_json: string | null;
}

interface ResolveThumbnailSourceOptions {
  forceVideoFrame?: boolean;
  strict?: boolean;
  assets?: AssetThumbnailRow[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toPositiveInteger = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null;
  return value;
};

const toNonNegativeFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
};

const normalizePageNumber = (value: number | undefined, asset: AssetThumbnailRow) =>
  Number.isInteger(value) && value !== undefined && value > 0 ? value : asset.order_in_stack + 1;

const normalizeTimeSeconds = (value: number | undefined) =>
  Number.isFinite(value) && value !== undefined ? Math.max(0, value) : 0;

const parseThumbnailSource = (value: unknown): StackThumbnailSource | null => {
  if (!isRecord(value)) return null;

  const assetId = toPositiveInteger(value.assetId);
  const pageNumber = toPositiveInteger(value.pageNumber);
  if (assetId === null || pageNumber === null) return null;

  if (value.kind === 'asset') {
    return { kind: 'asset', assetId, pageNumber };
  }

  if (value.kind === 'videoFrame') {
    const timeSeconds = toNonNegativeFiniteNumber(value.timeSeconds);
    if (timeSeconds === null) return null;
    return { kind: 'videoFrame', assetId, pageNumber, timeSeconds };
  }

  return null;
};

const resolveThumbnailExtension = (asset: AssetThumbnailRow) => {
  const storedType = asset.file_type.trim().toLowerCase();
  const storedExtension = canonicalizeExtension(storedType);
  if (isImageExtension(storedExtension) || isVideoExtension(storedExtension)) {
    return storedExtension;
  }

  const fileExtension = canonicalizeExtension(path.extname(asset.file));
  if (isImageExtension(fileExtension) || isVideoExtension(fileExtension)) {
    return fileExtension;
  }

  if (isImageFileType(storedType) || isVideoFileType(storedType)) {
    return fileExtension || null;
  }

  return null;
};

export class StackThumbnailService {
  constructor(private db: DatabaseSync) {}

  async setStackThumbnailSource(stackId: number, input: SetStackThumbnailSourceInput) {
    const stack = this.getStackThumbnailMeta(stackId);
    if (!stack) return null;

    const asset = this.getThumbnailAssetById(stackId, input.assetId);
    if (!asset) return null;

    const extension = resolveThumbnailExtension(asset);
    const isVideo =
      (extension !== null && isVideoExtension(extension)) || isVideoFileType(asset.file_type);
    const source: StackThumbnailSource = isVideo
      ? {
          kind: 'videoFrame',
          assetId: asset.id,
          pageNumber: normalizePageNumber(input.pageNumber, asset),
          timeSeconds: normalizeTimeSeconds(input.timeSeconds),
        }
      : {
          kind: 'asset',
          assetId: asset.id,
          pageNumber: normalizePageNumber(input.pageNumber, asset),
        };

    const thumbnail = await this.resolveThumbnailFromSource(stackId, stack.dataset_id, source, {
      assets: [asset],
      forceVideoFrame: true,
      strict: true,
    });
    if (!thumbnail) return null;

    const meta = parseJsonObject(stack.meta_json);
    meta.thumbnailSource = source;
    const result = this.db
      .prepare('UPDATE stacks SET thumbnail = ?, meta_json = ?, updated_at = ? WHERE id = ?')
      .run(thumbnail, JSON.stringify(meta), nowIso(), stackId);

    return result.changes > 0 ? { success: true, thumbnail, thumbnailSource: source } : null;
  }

  async refreshStackThumbnail(stackId: number, options: RefreshAssetThumbnailOptions = {}) {
    const stack = this.getStackThumbnailMeta(stackId);
    if (!stack) return false;

    const source = parseThumbnailSource(parseJsonObject(stack.meta_json).thumbnailSource);
    if (source) {
      const thumbnail = await this.resolveThumbnailFromSource(stackId, stack.dataset_id, source, {
        forceVideoFrame: options.force ?? false,
      });
      if (thumbnail) {
        return this.updateStackThumbnail(stackId, thumbnail);
      }
    }

    const firstAsset = this.getThumbnailAssets(stackId)[0];
    return this.updateStackThumbnail(stackId, firstAsset?.thumbnail ?? '');
  }

  async regenerateAssetThumbnails(stackId: number, options: RefreshAssetThumbnailOptions = {}) {
    const stack = getStackDataset(this.db, stackId);
    if (!stack) return null;

    const force = options.force ?? false;
    const assets = this.getThumbnailAssets(stackId);
    const eligibleAssets = assets
      .map((asset): ResolvedThumbnailAsset | null => {
        const extension = resolveThumbnailExtension(asset);
        return extension ? { asset, extension } : null;
      })
      .filter((entry): entry is ResolvedThumbnailAsset => entry !== null);
    const thumbnails: Array<{ assetId: number; thumbnail: string | null }> = [];
    const failed: number[] = [];
    let regenerated = 0;
    let skipped = 0;

    for (const { asset, extension } of eligibleAssets) {
      const shouldRefreshDimensions = force || asset.width === null || asset.height === null;
      const dimensions = shouldRefreshDimensions
        ? await readAssetDimensions(asset.file)
        : { width: asset.width, height: asset.height };
      const hasUsableThumbnail =
        asset.thumbnail.trim().length > 0 && DataStorage.exists(asset.thumbnail, stack.dataset_id);
      if (!force && hasUsableThumbnail) {
        if (shouldRefreshDimensions) {
          this.db
            .prepare('UPDATE assets SET width = ?, height = ?, updated_at = ? WHERE id = ?')
            .run(dimensions.width, dimensions.height, nowIso(), asset.id);
        }
        skipped++;
        thumbnails.push({ assetId: asset.id, thumbnail: asset.thumbnail });
        continue;
      }

      try {
        const thumbnailKey = await generateThumbnail(
          asset.file,
          extension,
          force,
          stack.dataset_id
        );
        this.db
          .prepare(
            'UPDATE assets SET thumbnail = ?, width = ?, height = ?, updated_at = ? WHERE id = ?'
          )
          .run(thumbnailKey, dimensions.width, dimensions.height, nowIso(), asset.id);
        regenerated++;
        thumbnails.push({ assetId: asset.id, thumbnail: thumbnailKey });
      } catch (error) {
        failed.push(asset.id);
        thumbnails.push({ assetId: asset.id, thumbnail: asset.thumbnail || null });
        console.error(`Failed to regenerate thumbnail for asset ${asset.id}`, error);
      }
    }

    const refreshed = await this.refreshStackThumbnail(stackId, { force });
    return {
      success: refreshed && failed.length === 0,
      totalAssets: assets.length,
      eligible: eligibleAssets.length,
      regenerated,
      skipped,
      failed,
      thumbnails,
    };
  }

  private getStackThumbnailMeta(stackId: number) {
    return this.db
      .prepare(
        `SELECT dataset_id, thumbnail, meta_json
         FROM stacks
         WHERE id = ?`
      )
      .get(stackId) as StackThumbnailMetaRow | undefined;
  }

  private getThumbnailAssets(stackId: number) {
    return this.db
      .prepare(
        `SELECT id, file, thumbnail, file_type, hash, width, height, order_in_stack
         FROM assets
         WHERE stack_id = ?
         ORDER BY order_in_stack ASC, id ASC`
      )
      .all(stackId) as AssetThumbnailRow[];
  }

  private getThumbnailAssetById(stackId: number, assetId: number) {
    return this.db
      .prepare(
        `SELECT id, file, thumbnail, file_type, hash, width, height, order_in_stack
         FROM assets
         WHERE stack_id = ? AND id = ?`
      )
      .get(stackId, assetId) as AssetThumbnailRow | undefined;
  }

  private async resolveThumbnailFromSource(
    stackId: number,
    datasetId: number,
    source: StackThumbnailSource,
    options: ResolveThumbnailSourceOptions = {}
  ) {
    const assets = options.assets ?? this.getThumbnailAssets(stackId);
    const asset = this.resolveSourceAsset(assets, source);
    if (!asset) {
      if (options.strict) throw new Error('Thumbnail source asset was not found');
      return null;
    }

    if (source.kind === 'videoFrame') {
      return this.generateVideoFrameThumbnail(stackId, datasetId, asset, source, options);
    }

    return this.ensureAssetThumbnail(asset, datasetId, options.strict ?? false);
  }

  private resolveSourceAsset(assets: AssetThumbnailRow[], source: StackThumbnailSource) {
    const assetById = assets.find((asset) => asset.id === source.assetId);
    if (assetById) return assetById;
    return assets[source.pageNumber - 1] ?? null;
  }

  private async ensureAssetThumbnail(asset: AssetThumbnailRow, datasetId: number, strict: boolean) {
    const existingThumbnail = asset.thumbnail.trim();
    if (existingThumbnail && DataStorage.exists(existingThumbnail, datasetId)) {
      return existingThumbnail;
    }

    const extension = resolveThumbnailExtension(asset);
    if (!extension) {
      if (strict) throw new Error('Asset does not support thumbnail generation');
      return existingThumbnail || null;
    }

    try {
      const thumbnailKey = await generateThumbnail(asset.file, extension, false, datasetId);
      const dimensions =
        asset.width === null || asset.height === null
          ? await readAssetDimensions(asset.file)
          : { width: asset.width, height: asset.height };
      this.db
        .prepare(
          'UPDATE assets SET thumbnail = ?, width = ?, height = ?, updated_at = ? WHERE id = ?'
        )
        .run(thumbnailKey, dimensions.width, dimensions.height, nowIso(), asset.id);
      return thumbnailKey;
    } catch (error) {
      if (strict) throw error;
      console.error(`Failed to generate thumbnail for asset ${asset.id}`, error);
      return existingThumbnail || null;
    }
  }

  private async generateVideoFrameThumbnail(
    stackId: number,
    datasetId: number,
    asset: AssetThumbnailRow,
    source: Extract<StackThumbnailSource, { kind: 'videoFrame' }>,
    options: ResolveThumbnailSourceOptions
  ) {
    const extension = resolveThumbnailExtension(asset);
    if (!extension || !isVideoExtension(extension)) {
      if (options.strict) throw new Error('Thumbnail source asset is not a video');
      return null;
    }

    const outputKey = buildStackFrameThumbnailKey(datasetId, stackId, asset.id, source.timeSeconds);
    try {
      return await generateThumbnail(
        asset.file,
        extension,
        options.forceVideoFrame ?? false,
        datasetId,
        {
          outputKey,
          videoTimeSeconds: source.timeSeconds,
        }
      );
    } catch (error) {
      if (options.strict) throw error;
      console.error(`Failed to generate video frame thumbnail for asset ${asset.id}`, error);
      return null;
    }
  }

  private updateStackThumbnail(stackId: number, thumbnail: string) {
    const result = this.db
      .prepare('UPDATE stacks SET thumbnail = ?, updated_at = ? WHERE id = ?')
      .run(thumbnail, nowIso(), stackId);
    return result.changes > 0;
  }
}
