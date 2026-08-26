import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DataStorage } from '../../../lib/DataStorage';
import { buildAssetKey } from '../../../utils/assetPath';
import {
  canonicalizeMediaExtension,
  ensureMediaExtension,
  isSupportedMediaExtension,
  resolveMediaExtension,
} from '../../../utils/mediaFormat';
import { StandaloneAutoTagRepository } from '../auto-tag-repository';
import { nowIso } from '../sqlite';
import type { StackColorService } from './color-service';
import { getStackDataset, isDominantColor, parseJsonArray, toColorJson } from './helpers';
import type { StackMediaTypeService } from './media-type-service';
import type { StackPreviewService } from './preview-service';
import type { StackThumbnailService } from './thumbnail-service';

interface RefreshAssetRow {
  id: number;
  file: string;
  thumbnail: string;
  file_type: string;
  original_name: string;
  hash: string;
  dominant_colors_json: string | null;
}

interface FormatRepairResult {
  repaired: number;
  failed: number[];
}

interface ColorRefreshResult {
  eligible: number;
  regenerated: number;
  skipped: number;
  failed: number[];
}

export interface RefreshStackMetadataOptions {
  force?: boolean;
}

export class StackRefreshService {
  private autoTagRepository: StandaloneAutoTagRepository;

  constructor(
    private db: DatabaseSync,
    private colorService: StackColorService,
    private mediaTypeService: StackMediaTypeService,
    private previewService: StackPreviewService,
    private thumbnailService: StackThumbnailService
  ) {
    this.autoTagRepository = new StandaloneAutoTagRepository(db);
  }

  async refreshStackMetadata(stackId: number, options: RefreshStackMetadataOptions = {}) {
    const stack = getStackDataset(this.db, stackId);
    if (!stack) return null;

    const force = options.force ?? true;
    const formats = await this.repairAssetFormats(stackId, stack.dataset_id);
    const thumbnails = await this.thumbnailService.regenerateAssetThumbnails(stackId, { force });
    const previews = await this.previewService.regeneratePreviews(stackId, stack.dataset_id, {
      force,
    });
    const colors = await this.refreshAssetColors(stackId, force);
    this.colorService.refreshStackColors(stackId);
    const mediaType = this.mediaTypeService.refreshStackActualMediaType(stackId);
    const autoTags = await this.autoTagRepository.refreshStackTags(stackId, {
      threshold: 0.4,
      forceRegenerate: force,
    });

    return {
      stackId,
      datasetId: stack.dataset_id,
      formats,
      thumbnails,
      previews,
      colors,
      mediaType,
      autoTags,
    };
  }

  private getAssets(stackId: number) {
    return this.db
      .prepare(
        `SELECT id, file, thumbnail, file_type, original_name, hash, dominant_colors_json
         FROM assets
         WHERE stack_id = ?
         ORDER BY order_in_stack ASC, id ASC`
      )
      .all(stackId) as RefreshAssetRow[];
  }

  private async repairAssetFormats(
    stackId: number,
    datasetId: number
  ): Promise<FormatRepairResult> {
    const failed: number[] = [];
    let repaired = 0;

    for (const asset of this.getAssets(stackId)) {
      try {
        const extension = await resolveMediaExtension({
          sourcePath: DataStorage.getPath(asset.file),
          originalName: asset.original_name,
          mimeType: asset.file_type,
        });
        if (!extension) {
          failed.push(asset.id);
          continue;
        }

        const normalizedType = canonicalizeMediaExtension(extension);
        const normalizedName = ensureMediaExtension(asset.original_name, normalizedType);
        const currentFileExtension = canonicalizeMediaExtension(path.extname(asset.file));
        const nextFile =
          currentFileExtension === normalizedType
            ? asset.file
            : buildAssetKey(datasetId, asset.hash, normalizedType);
        const changed =
          nextFile !== asset.file ||
          normalizedType !== canonicalizeMediaExtension(asset.file_type) ||
          normalizedName !== asset.original_name;
        if (!changed) continue;

        await this.persistAssetFormat(asset, datasetId, nextFile, normalizedType, normalizedName);
        repaired++;
      } catch (error) {
        failed.push(asset.id);
        console.error(`Failed to repair media format for asset ${asset.id}`, error);
      }
    }

    return { repaired, failed };
  }

  private async persistAssetFormat(
    asset: RefreshAssetRow,
    datasetId: number,
    nextFile: string,
    nextType: string,
    nextName: string
  ) {
    const needsMove = nextFile !== asset.file;
    let moved = false;
    let targetAlreadyExists = false;

    if (needsMove) {
      targetAlreadyExists = DataStorage.exists(nextFile, datasetId);
      if (targetAlreadyExists) {
        const targetHash = await DataStorage.getHash(nextFile, datasetId);
        if (targetHash !== asset.hash) {
          throw new Error('修復先に異なる内容のファイルが存在します');
        }
      } else {
        DataStorage.move(nextFile, DataStorage.getPath(asset.file), datasetId);
        moved = true;
      }
    }

    try {
      this.db
        .prepare(
          `UPDATE assets
           SET file = ?, file_type = ?, original_name = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(nextFile, nextType, nextName, nowIso(), asset.id);
    } catch (error) {
      if (moved) {
        DataStorage.move(asset.file, DataStorage.getPath(nextFile), datasetId);
      }
      throw error;
    }

    if (needsMove && targetAlreadyExists && DataStorage.exists(asset.file, datasetId)) {
      await DataStorage.delete(asset.file, datasetId);
    }
  }

  private async refreshAssetColors(stackId: number, force: boolean): Promise<ColorRefreshResult> {
    const failed: number[] = [];
    let eligible = 0;
    let regenerated = 0;
    let skipped = 0;

    for (const asset of this.getAssets(stackId)) {
      const extension = canonicalizeMediaExtension(asset.file_type);
      if (!isSupportedMediaExtension(extension)) continue;
      eligible++;

      const existingColors = parseJsonArray(asset.dominant_colors_json).filter(isDominantColor);
      if (!force && existingColors.length > 0) {
        skipped++;
        continue;
      }

      const colors = await this.colorService.extractAssetColors(
        asset.file,
        asset.thumbnail,
        extension
      );
      if (!colors || colors.length === 0) {
        failed.push(asset.id);
        continue;
      }

      this.db
        .prepare('UPDATE assets SET dominant_colors_json = ?, updated_at = ? WHERE id = ?')
        .run(toColorJson(colors), nowIso(), asset.id);
      this.colorService.replaceAssetColors(asset.id, colors);
      regenerated++;
    }

    return { eligible, regenerated, skipped, failed };
  }
}
