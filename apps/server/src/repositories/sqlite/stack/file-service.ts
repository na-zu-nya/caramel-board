import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DuplicateAssetError } from '../../../errors/DuplicateAssetError';
import { DataStorage } from '../../../lib/DataStorage';
import { buildAssetKey } from '../../../utils/assetPath';
import { getExtension, getFileType, getHash } from '../../../utils/functions';
import { generateMediaPreview } from '../../../utils/generateMediaPreview';
import { generateThumbnail } from '../../../utils/generateThumbnail';
import { appendPdfOriginalMeta, isPdfFileInput, preparePdfImport } from '../../../utils/pdfImport';
import { nowIso, parseJsonObject } from '../sqlite';
import type { StackColorService } from './color-service';
import {
  canonicalizeExtension,
  getStackDataset,
  isImageExtension,
  isVideoExtension,
  placeholders,
  toColorJson,
} from './helpers';
import { toAsset } from './mappers';
import type { StackMetadataService } from './metadata-service';
import type { StackThumbnailService } from './thumbnail-service';
import type {
  AddAssetWithFileOptions,
  AssetRow,
  CountRow,
  CreateStackWithFileInput,
  DuplicateAssetRow,
  StandaloneFileInput,
} from './types';

type StackResolver<TStack> = (id: number, dataSetId: number) => TStack | null;

export class StackFileService {
  constructor(
    private db: DatabaseSync,
    private colorService: StackColorService,
    private metadataService: StackMetadataService,
    private thumbnailService: StackThumbnailService
  ) {}

  async createStackWithFile<TStack>(
    input: CreateStackWithFileInput,
    resolveStack: StackResolver<TStack>
  ) {
    const now = nowIso();
    const authorId = input.author?.trim()
      ? this.metadataService.findOrCreateAuthor(input.dataSetId, input.author.trim())
      : null;
    const result = this.db
      .prepare(
        `INSERT INTO stacks
           (dataset_id, author_id, name, thumbnail, media_type, liked, meta_json, dominant_colors_json, created_at, updated_at)
         VALUES (?, ?, ?, '', ?, 0, '{}', NULL, ?, ?)`
      )
      .run(input.dataSetId, authorId, input.name, input.mediaType, now, now);
    const stackId = Number(result.lastInsertRowid);

    try {
      const asset = await this.addAssetWithFile(stackId, input.file);
      if (!asset) {
        this.deleteStack(stackId);
        return null;
      }
      for (const tag of input.tags ?? []) {
        const trimmed = tag.trim();
        if (trimmed) this.metadataService.addTag(stackId, trimmed);
      }
      this.colorService.refreshStackColors(stackId);
      return resolveStack(stackId, input.dataSetId);
    } catch (error) {
      this.deleteStack(stackId);
      throw error;
    }
  }

  async addAssetWithFile(
    stackId: number,
    file: StandaloneFileInput,
    options: AddAssetWithFileOptions = {}
  ) {
    const stack = getStackDataset(this.db, stackId);
    if (!stack) return null;

    if (!options.allowDuplicate && (await isPdfFileInput(file))) {
      return this.addPdfWithFile(stackId, file, stack.dataset_id);
    }

    const hash = await getHash(file.path);
    const ext = this.resolveAssetExtension(file.path, file.originalname);
    if (!options.allowDuplicate) {
      const existing = this.db
        .prepare(
          `SELECT a.id, a.stack_id
           FROM assets a
           JOIN stacks s ON s.id = a.stack_id
           WHERE s.dataset_id = ? AND a.hash = ?
           LIMIT 1`
        )
        .get(stack.dataset_id, hash) as DuplicateAssetRow | undefined;

      if (existing) {
        try {
          fs.rmSync(file.path, { force: true });
        } catch {}
        if (existing.stack_id === stackId) {
          throw new DuplicateAssetError('このスタックに同一画像が既に存在します', {
            assetId: existing.id,
            stackId: existing.stack_id,
            scope: 'same-stack',
          });
        }
        throw new DuplicateAssetError('重複画像のため追加できません（別スタックに存在）', {
          assetId: existing.id,
          stackId: existing.stack_id,
          scope: 'dataset',
        });
      }
    }

    const key = buildAssetKey(stack.dataset_id, options.storageHash ?? hash, ext);
    await DataStorage.mkdir(path.dirname(key), stack.dataset_id);
    DataStorage.move(key, file.path, stack.dataset_id);

    let thumbnailKey = '';
    try {
      thumbnailKey = await generateThumbnail(key, ext, false, stack.dataset_id);
    } catch (error) {
      console.error('Failed to generate thumbnail for standalone asset upload', error);
    }

    let previewKey: string | null = null;
    try {
      previewKey = await generateMediaPreview(key, hash, ext, { dataSetId: stack.dataset_id });
    } catch (error) {
      console.error('Failed to generate preview for standalone asset upload', error);
    }

    const dominantColors = await this.colorService.extractAssetColors(key, thumbnailKey, ext);
    const nextOrder =
      (
        this.db
          .prepare(
            'SELECT COALESCE(MAX(order_in_stack), -1) AS count FROM assets WHERE stack_id = ?'
          )
          .get(stackId) as CountRow | undefined
      )?.count ?? -1;
    const now = nowIso();
    const created = this.db
      .prepare(
        `INSERT INTO assets
           (stack_id, file, thumbnail, preview, file_type, original_name, hash, order_in_stack, meta_json, dominant_colors_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        stackId,
        key,
        thumbnailKey,
        previewKey,
        ext,
        file.originalname,
        hash,
        nextOrder + 1,
        JSON.stringify(options.meta ?? {}),
        toColorJson(dominantColors),
        now,
        now
      );
    const assetId = Number(created.lastInsertRowid);
    this.colorService.replaceAssetColors(assetId, dominantColors);

    if (thumbnailKey) {
      this.db
        .prepare(
          `UPDATE stacks
           SET thumbnail = CASE WHEN thumbnail = '' THEN ? ELSE thumbnail END,
               updated_at = ?
           WHERE id = ?`
        )
        .run(thumbnailKey, now, stackId);
    }
    this.colorService.refreshStackColors(stackId);

    const row = this.db
      .prepare(
        `SELECT assets.*, 0 AS is_favorite
         FROM assets
         WHERE id = ?`
      )
      .get(assetId) as AssetRow | undefined;
    return row ? toAsset(row, stack.dataset_id) : null;
  }

  private async addPdfWithFile(stackId: number, file: StandaloneFileInput, dataSetId: number) {
    const preparedPdf = await preparePdfImport(file, dataSetId);
    const createdAssetIds: number[] = [];
    let firstAsset: ReturnType<typeof toAsset> | null = null;

    try {
      for (const page of preparedPdf.pages) {
        const asset = await this.addAssetWithFile(stackId, page, {
          allowDuplicate: true,
          storageHash: page.storageHash,
          meta: {
            sourcePdfHash: preparedPdf.original.hash,
            sourcePdfImportId: preparedPdf.original.importId,
            sourcePdfPage: page.pageNumber,
            rasterDpi: preparedPdf.original.rasterDpi,
          },
        });
        if (asset) {
          createdAssetIds.push(Number(asset.id));
          if (!firstAsset) firstAsset = asset;
        }
      }

      const stack = this.db
        .prepare('SELECT meta_json FROM stacks WHERE id = ? AND dataset_id = ?')
        .get(stackId, dataSetId) as { meta_json: string | null } | undefined;
      const nextMeta = appendPdfOriginalMeta(
        parseJsonObject(stack?.meta_json),
        preparedPdf.original
      );
      this.db
        .prepare('UPDATE stacks SET meta_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(nextMeta), nowIso(), stackId);
      this.thumbnailService.refreshStackThumbnail(stackId);
      this.colorService.refreshStackColors(stackId);
      return firstAsset;
    } catch (error) {
      if (createdAssetIds.length > 0) {
        this.db
          .prepare(`DELETE FROM assets WHERE id IN (${placeholders(createdAssetIds)})`)
          .run(...createdAssetIds);
        this.thumbnailService.refreshStackThumbnail(stackId);
        this.colorService.refreshStackColors(stackId);
      }
      throw error;
    } finally {
      preparedPdf.cleanup();
    }
  }

  private deleteStack(stackId: number) {
    const result = this.db.prepare('DELETE FROM stacks WHERE id = ?').run(stackId);
    return result.changes > 0;
  }

  private resolveAssetExtension(sourcePath: string, originalName: string) {
    const candidates = [
      canonicalizeExtension(getFileType(originalName)),
      canonicalizeExtension(getExtension(originalName)),
      canonicalizeExtension(path.extname(originalName)),
      canonicalizeExtension(path.extname(sourcePath)),
    ].filter((value) => value.length > 0);
    const supported = candidates.find(
      (candidate) => isImageExtension(candidate) || isVideoExtension(candidate)
    );
    if (supported) return supported;
    return candidates[0] || 'jpg';
  }
}
