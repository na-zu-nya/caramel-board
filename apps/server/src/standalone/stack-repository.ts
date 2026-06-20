import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DuplicateAssetError } from '../errors/DuplicateAssetError';
import { DataStorage } from '../lib/DataStorage';
import { buildAssetKey, toPublicAssetPath, withPublicAssetArray } from '../utils/assetPath';
import { ColorExtractor, type DominantColor } from '../utils/colorExtractor';
import { getExtension, getFileType, getHash } from '../utils/functions';
import { generateMediaPreview, shouldGeneratePreview } from '../utils/generateMediaPreview';
import { generateThumbnail } from '../utils/generateThumbnail';
import {
  appendPdfOriginalMeta,
  extractPdfOriginalsFromMeta,
  isPdfFileInput,
  preparePdfImport,
} from '../utils/pdfImport';
import { getStandaloneSqlite, nowIso, parseJsonObject } from './sqlite';

export interface StandaloneStackListParams {
  dataSetId: number;
  collection?: number;
  mediaType?: 'image' | 'comic' | 'video';
  tag?: string | string[];
  author?: string | string[];
  fav?: '0' | '1';
  liked?: '0' | '1';
  hasNoTags?: boolean;
  hasNoAuthor?: boolean;
  search?: string;
  stackIds?: number[];
  sort?: 'recommended' | 'dateAdded' | 'name' | 'likes' | 'updated' | 'id';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

interface StackRow {
  id: number;
  dataset_id: number;
  author_id: number | null;
  author_name: string | null;
  name: string;
  thumbnail: string;
  media_type: string;
  liked: number;
  meta_json: string | null;
  dominant_colors_json: string | null;
  created_at: string;
  updated_at: string;
  asset_count: number;
  is_favorite: number;
}

interface AuthorLinkRow {
  id: number;
  author_id: number;
  provider: string | null;
  label: string;
  url: string;
  external_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface AssetRow {
  id: number;
  stack_id: number;
  file: string;
  thumbnail: string;
  preview: string | null;
  file_type: string;
  original_name: string;
  hash: string;
  order_in_stack: number;
  meta_json: string | null;
  dominant_colors_json: string | null;
  created_at: string;
  updated_at: string;
  is_favorite?: number;
}

interface OriginalAssetRow {
  id: number;
  stack_id: number;
  file: string;
  file_type: string;
  original_name: string;
}

interface AssetPreviewRow {
  id: number;
  file: string;
  file_type: string;
  hash: string;
  preview: string | null;
}

interface StandaloneFileInput {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

interface AddAssetWithFileOptions {
  allowDuplicate?: boolean;
  storageHash?: string;
  meta?: Record<string, unknown>;
}

interface CreateStackWithFileInput {
  dataSetId: number;
  name: string;
  mediaType: 'image' | 'comic' | 'video';
  author?: string;
  tags?: string[];
  file: StandaloneFileInput;
}

interface DuplicateAssetRow {
  id: number;
  stack_id: number;
}

interface TagRow {
  id: number;
  title: string;
}

interface CountRow {
  count: number;
}

interface AutoTagScoreRow {
  stack_id: number;
  tag_key: string;
  score: number;
}

interface AutoTagAggregateRow {
  top_tags_json: string | null;
}

interface AutoTagMappingDisplayRow {
  auto_tag_key: string;
  display_name: string;
  tag_id: number | null;
  tag_title: string | null;
}

interface AutoTagEntry {
  tag: string;
  score?: number;
}

interface ManualTagRow {
  stack_id: number;
  title: string;
}

interface DocumentFrequencyRow {
  tag_key: string;
  count: number;
}

interface SimilarVectors {
  auto: Map<string, number>;
  manual: Set<string>;
}

const DEFAULT_AUTO_STOP_TAGS = [
  '1girl',
  '1boy',
  'solo',
  'rating:safe',
  'safe',
  'highres',
  'long_hair',
  'short_hair',
  'looking_at_viewer',
  'smile',
  'simple_background',
  'multiple_views',
];

const SIMILAR_CONFIG = {
  autoTopN: 30,
  autoProbeCount: 8,
  autoMinScore: 0.55,
  manualTopN: 60,
  candidateLimit: 1500,
  resultLimit: 1000,
  autoWeight: 1.0,
  manualWeight: 1.2,
  manualWeightMultiplierOnIdf: 1.0,
  minIdf: 0.05,
};

const toArray = (value: string | string[] | undefined) => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const parseJsonArray = (value: string | null | undefined): unknown[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const placeholders = (values: unknown[]) => values.map(() => '?').join(', ');
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const normalizeTag = (tag: string) => tag.trim().toLowerCase();
const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff',
]);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm']);
const normalizeExtension = (ext: string) => ext.replace(/^\./, '').toLowerCase();
const canonicalizeExtension = (ext: string) => {
  const normalized = normalizeExtension(ext);
  return normalized === 'jpeg' ? 'jpg' : normalized;
};
const isImageExtension = (ext: string) => IMAGE_EXTENSIONS.has(canonicalizeExtension(ext));
const isVideoExtension = (ext: string) => VIDEO_EXTENSIONS.has(canonicalizeExtension(ext));
const toColorJson = (colors: DominantColor[] | null) =>
  colors && colors.length > 0 ? JSON.stringify(colors) : null;
const toAutoTagEntry = (value: unknown): AutoTagEntry | null => {
  if (typeof value === 'string') return { tag: value };
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const tag = typeof record.tag === 'string' ? record.tag : '';
  if (!tag) return null;
  const rawScore = record.score;
  const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : undefined;
  return { tag, score };
};

const toAsset = (row: AssetRow, dataSetId: number) => ({
  id: row.id,
  stackId: row.stack_id,
  file: toPublicAssetPath(row.file, dataSetId),
  thumbnail: toPublicAssetPath(row.thumbnail, dataSetId),
  preview: row.preview ? toPublicAssetPath(row.preview, dataSetId) : null,
  fileType: row.file_type,
  mimeType: row.file_type,
  originalName: row.original_name,
  hash: row.hash,
  orderInStack: row.order_in_stack,
  meta: parseJsonObject(row.meta_json),
  dominantColors: parseJsonArray(row.dominant_colors_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  favorited: row.is_favorite === 1,
  isFavorite: row.is_favorite === 1,
});

export class StandaloneStackRepository {
  constructor(private db: DatabaseSync = getStandaloneSqlite()) {}

  private ensureUserId() {
    const existing = this.db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as
      | { id: number }
      | undefined;
    if (existing) return existing.id;

    const now = nowIso();
    const result = this.db
      .prepare('INSERT INTO users (name, role, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('Standalone User', 'super', now, now);
    return Number(result.lastInsertRowid);
  }

  private buildStackWhere(params: StandaloneStackListParams, sqlParams: unknown[]) {
    const where = ['s.dataset_id = ?'];
    sqlParams.push(params.dataSetId);

    if (params.collection) {
      where.push(
        'EXISTS (SELECT 1 FROM collection_stacks cs WHERE cs.stack_id = s.id AND cs.collection_id = ?)'
      );
      sqlParams.push(params.collection);
    }

    if (params.stackIds) {
      if (params.stackIds.length === 0) {
        where.push('0 = 1');
      } else {
        where.push(`s.id IN (${placeholders(params.stackIds)})`);
        sqlParams.push(...params.stackIds);
      }
    }

    if (params.mediaType) {
      where.push('s.media_type = ?');
      sqlParams.push(params.mediaType);
    }

    const tags = toArray(params.tag).filter((tag) => tag.trim().length > 0);
    if (tags.length > 0) {
      where.push(`EXISTS (
        SELECT 1
        FROM stack_tags st
        JOIN tags t ON t.id = st.tag_id
        WHERE st.stack_id = s.id AND t.title IN (${placeholders(tags)})
      )`);
      sqlParams.push(...tags);
    }

    const authors = toArray(params.author).filter((author) => author.trim().length > 0);
    if (authors.length > 0) {
      where.push(`a.name IN (${placeholders(authors)})`);
      sqlParams.push(...authors);
    }

    if (params.fav === '1') {
      where.push('EXISTS (SELECT 1 FROM stack_favorites sf WHERE sf.stack_id = s.id)');
    } else if (params.fav === '0') {
      where.push('NOT EXISTS (SELECT 1 FROM stack_favorites sf WHERE sf.stack_id = s.id)');
    }

    if (params.liked === '1') {
      where.push('s.liked <> 0');
    } else if (params.liked === '0') {
      where.push('s.liked = 0');
    }

    if (params.hasNoTags) {
      where.push('NOT EXISTS (SELECT 1 FROM stack_tags st WHERE st.stack_id = s.id)');
    }

    if (params.hasNoAuthor) {
      where.push('s.author_id IS NULL');
    }

    const search = params.search?.trim();
    if (search) {
      const like = `%${search}%`;
      where.push(`(
        s.name LIKE ? COLLATE NOCASE OR
        a.name LIKE ? COLLATE NOCASE OR
        EXISTS (
          SELECT 1
          FROM author_links al
          WHERE al.author_id = s.author_id
            AND (
              al.external_id LIKE ? COLLATE NOCASE OR
              al.url LIKE ? COLLATE NOCASE
            )
        ) OR
        EXISTS (
          SELECT 1
          FROM stack_tags st
          JOIN tags t ON t.id = st.tag_id
          WHERE st.stack_id = s.id AND t.title LIKE ? COLLATE NOCASE
        ) OR
        EXISTS (
          SELECT 1
          FROM stack_auto_tag_scores scores
          LEFT JOIN auto_tag_mappings m
            ON m.dataset_id = s.dataset_id
           AND m.is_active = 1
           AND lower(m.auto_tag_key) = lower(scores.tag_key)
          WHERE scores.stack_id = s.id
            AND scores.score >= ?
            AND (
              scores.tag_key LIKE ? COLLATE NOCASE OR
              m.display_name LIKE ? COLLATE NOCASE
            )
        )
      )`);
      sqlParams.push(like, like, like, like, like, 0.4, like, like);
    }

    return where.join(' AND ');
  }

  private stackSelectSql(whereSql: string) {
    return `
      SELECT
        s.id,
        s.dataset_id,
        s.author_id,
        a.name AS author_name,
        s.name,
        s.thumbnail,
        s.media_type,
        s.liked,
        s.meta_json,
        s.dominant_colors_json,
        s.created_at,
        s.updated_at,
        COUNT(asset_count.id) AS asset_count,
        CASE WHEN EXISTS (SELECT 1 FROM stack_favorites sf WHERE sf.stack_id = s.id) THEN 1 ELSE 0 END AS is_favorite
      FROM stacks s
      LEFT JOIN authors a ON a.id = s.author_id
      LEFT JOIN assets asset_count ON asset_count.stack_id = s.id
      WHERE ${whereSql}
      GROUP BY s.id
    `;
  }

  private orderBy(params: StandaloneStackListParams) {
    const direction = params.order === 'asc' ? 'ASC' : 'DESC';
    switch (params.sort) {
      case 'dateAdded':
        return `s.created_at ${direction}, s.id ${direction}`;
      case 'name':
        return `s.name ${direction}, s.id DESC`;
      case 'likes':
        return `s.liked ${direction}, s.updated_at DESC`;
      case 'id':
        return `s.id ${direction}`;
      default:
        return `s.created_at ${direction}, s.id ${direction}`;
    }
  }

  getPaginated(params: StandaloneStackListParams) {
    const sqlParams: unknown[] = [];
    const whereSql = this.buildStackWhere(params, sqlParams);
    const countRow = this.db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM stacks s
        LEFT JOIN authors a ON a.id = s.author_id
        WHERE ${whereSql}
      `)
      .get(...sqlParams) as CountRow | undefined;

    const rows = this.db
      .prepare(`${this.stackSelectSql(whereSql)} ORDER BY ${this.orderBy(params)} LIMIT ? OFFSET ?`)
      .all(...sqlParams, params.limit, params.offset) as StackRow[];

    return {
      stacks: rows.map((row) => this.toStack(row, { includeAssets: true })),
      total: countRow?.count ?? 0,
      limit: params.limit,
      offset: params.offset,
    };
  }

  getById(id: number, dataSetId?: number) {
    const params: unknown[] = [id];
    const where = ['s.id = ?'];
    if (dataSetId !== undefined) {
      where.push('s.dataset_id = ?');
      params.push(dataSetId);
    }

    const row = this.db.prepare(this.stackSelectSql(where.join(' AND '))).get(...params) as
      | StackRow
      | undefined;

    return row ? this.toStack(row, { includeAssets: true, includeTags: true }) : null;
  }

  getStackIdsByDataset(dataSetId: number) {
    const rows = this.db
      .prepare('SELECT id FROM stacks WHERE dataset_id = ? ORDER BY id ASC')
      .all(dataSetId) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

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

  getSimilarByStackIds(
    dataSetId: number,
    sourceStackIds: number[],
    options: { limit: number; offset: number; threshold?: number }
  ) {
    const sourceIds = Array.from(new Set(sourceStackIds)).filter((id) => Number.isFinite(id));
    if (sourceIds.length === 0) {
      return { stacks: [], total: 0, limit: options.limit, offset: options.offset };
    }

    const verifiedSourceIds = this.getExistingStackIds(dataSetId, sourceIds);
    if (verifiedSourceIds.length === 0) {
      return { stacks: [], total: 0, limit: options.limit, offset: options.offset };
    }

    const stopTags = new Set(DEFAULT_AUTO_STOP_TAGS.map(normalizeTag));
    const reference = this.buildSimilarReference(dataSetId, verifiedSourceIds, stopTags);
    const similarIds = this.runSimilarSearch(dataSetId, reference, verifiedSourceIds, stopTags, {
      threshold: options.threshold,
    });
    const pagedIds = similarIds.slice(options.offset, options.offset + options.limit);

    return {
      stacks: pagedIds
        .map((id) => this.getById(id, dataSetId))
        .filter((stack): stack is NonNullable<ReturnType<typeof this.getById>> => stack !== null),
      total: similarIds.length,
      limit: options.limit,
      offset: options.offset,
    };
  }

  async regeneratePreviews(stackId: number, dataSetId: number, options: { force?: boolean } = {}) {
    const stack = this.getStackDataset(stackId);
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

  async createStackWithFile(input: CreateStackWithFileInput) {
    const now = nowIso();
    const authorId = input.author?.trim()
      ? this.findOrCreateAuthor(input.dataSetId, input.author.trim())
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
        if (trimmed) this.addTag(stackId, trimmed);
      }
      this.refreshStackColors(stackId);
      return this.getById(stackId, input.dataSetId);
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
    const stack = this.getStackDataset(stackId);
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

    const dominantColors = await this.extractAssetColors(key, thumbnailKey, ext);
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
    this.replaceAssetColors(assetId, dominantColors);

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
    this.refreshStackColors(stackId);

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
      this.refreshStackThumbnail(stackId);
      this.refreshStackColors(stackId);
      return firstAsset;
    } catch (error) {
      if (createdAssetIds.length > 0) {
        this.db
          .prepare(`DELETE FROM assets WHERE id IN (${placeholders(createdAssetIds)})`)
          .run(...createdAssetIds);
        this.refreshStackThumbnail(stackId);
        this.refreshStackColors(stackId);
      }
      throw error;
    } finally {
      preparedPdf.cleanup();
    }
  }

  updateStack(
    stackId: number,
    dataSetId: number,
    data: {
      name?: string;
      thumbnail?: string;
      meta?: Record<string, unknown>;
      mediaType?: 'image' | 'comic' | 'video';
    }
  ) {
    if (!this.getById(stackId, dataSetId)) return null;
    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.thumbnail !== undefined) {
      updates.push('thumbnail = ?');
      params.push(data.thumbnail);
    }
    if (data.meta !== undefined) {
      updates.push('meta_json = ?');
      params.push(JSON.stringify(data.meta));
    }
    if (data.mediaType !== undefined) {
      updates.push('media_type = ?');
      params.push(data.mediaType);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(nowIso());
      this.db
        .prepare(`UPDATE stacks SET ${updates.join(', ')} WHERE id = ? AND dataset_id = ?`)
        .run(...params, stackId, dataSetId);
    }

    return this.getById(stackId, dataSetId);
  }

  stackBelongsToDataset(stackId: number, dataSetId: number) {
    return Boolean(
      this.db
        .prepare('SELECT id FROM stacks WHERE id = ? AND dataset_id = ?')
        .get(stackId, dataSetId)
    );
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

  toggleStackFavorite(stackId: number, favorited: boolean) {
    if (!this.stackExists(stackId)) return false;
    const userId = this.ensureUserId();
    if (favorited) {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO stack_favorites (user_id, stack_id, created_at) VALUES (?, ?, ?)'
        )
        .run(userId, stackId, nowIso());
    } else {
      this.db
        .prepare('DELETE FROM stack_favorites WHERE user_id = ? AND stack_id = ?')
        .run(userId, stackId);
    }
    return true;
  }

  toggleAssetFavorite(assetId: number, favorited: boolean) {
    if (!this.getAssetWithDataset(assetId)) return false;
    const userId = this.ensureUserId();
    if (favorited) {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO asset_favorites (user_id, asset_id, created_at) VALUES (?, ?, ?)'
        )
        .run(userId, assetId, nowIso());
    } else {
      this.db
        .prepare('DELETE FROM asset_favorites WHERE user_id = ? AND asset_id = ?')
        .run(userId, assetId);
    }
    return true;
  }

  likeStack(stackId: number, assetId?: number) {
    const stack = this.getStackDataset(stackId);
    if (!stack) return null;
    const userId = this.ensureUserId();
    const now = nowIso();
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE stacks SET liked = liked + 1 WHERE id = ?').run(stackId);
      this.db
        .prepare(
          'INSERT INTO like_activities (stack_id, asset_id, user_id, created_at) VALUES (?, ?, ?, ?)'
        )
        .run(stackId, assetId ?? null, userId, now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    const liked = (
      this.db.prepare('SELECT liked FROM stacks WHERE id = ?').get(stackId) as
        | { liked: number }
        | undefined
    )?.liked;
    return { stackId, datasetId: stack.dataset_id, liked: liked ?? 0 };
  }

  likeAsset(assetId: number) {
    const asset = this.getAssetWithDataset(assetId);
    if (!asset) return null;
    const liked = this.likeStack(asset.stack_id, asset.id);
    if (!liked) return null;
    return { ...liked, assetId: asset.id };
  }

  addTag(stackId: number, tagTitle: string) {
    const stack = this.getStackDataset(stackId);
    if (!stack) return null;
    const now = nowIso();
    const existing = this.db
      .prepare('SELECT id FROM tags WHERE dataset_id = ? AND title = ? COLLATE NOCASE')
      .get(stack.dataset_id, tagTitle) as { id: number } | undefined;
    const tagId =
      existing?.id ??
      Number(
        this.db
          .prepare('INSERT INTO tags (dataset_id, title) VALUES (?, ?)')
          .run(stack.dataset_id, tagTitle).lastInsertRowid
      );
    this.db
      .prepare('INSERT OR IGNORE INTO stack_tags (stack_id, tag_id) VALUES (?, ?)')
      .run(stackId, tagId);
    this.db.prepare('UPDATE stacks SET updated_at = ? WHERE id = ?').run(now, stackId);
    return { success: true, tag: tagTitle };
  }

  removeTag(stackId: number, tagTitle: string) {
    const stack = this.getStackDataset(stackId);
    if (!stack) return null;
    this.db
      .prepare(
        `DELETE FROM stack_tags
         WHERE stack_id = ? AND tag_id IN (
           SELECT id FROM tags WHERE dataset_id = ? AND title = ? COLLATE NOCASE
         )`
      )
      .run(stackId, stack.dataset_id, tagTitle);
    this.db.prepare('UPDATE stacks SET updated_at = ? WHERE id = ?').run(nowIso(), stackId);
    return { success: true };
  }

  updateAuthor(stackId: number, name: string) {
    const stack = this.getStackDataset(stackId);
    if (!stack) return null;
    if (!name || name.trim() === '') {
      this.db
        .prepare('UPDATE stacks SET author_id = NULL, updated_at = ? WHERE id = ?')
        .run(nowIso(), stackId);
      return { success: true, author: null };
    }

    const existing = this.db
      .prepare('SELECT id FROM authors WHERE dataset_id = ? AND name = ? COLLATE NOCASE')
      .get(stack.dataset_id, name) as { id: number } | undefined;
    const authorId =
      existing?.id ??
      Number(
        this.db
          .prepare('INSERT INTO authors (dataset_id, name) VALUES (?, ?)')
          .run(stack.dataset_id, name).lastInsertRowid
      );
    this.db
      .prepare('UPDATE stacks SET author_id = ?, updated_at = ? WHERE id = ?')
      .run(authorId, nowIso(), stackId);
    return { success: true, author: name };
  }

  deleteStack(stackId: number) {
    const result = this.db.prepare('DELETE FROM stacks WHERE id = ?').run(stackId);
    return result.changes > 0;
  }

  deleteAsset(assetId: number) {
    const asset = this.getAssetWithDataset(assetId);
    if (!asset) return false;
    this.db.prepare('DELETE FROM assets WHERE id = ?').run(assetId);
    this.refreshStackThumbnail(asset.stack_id);
    return true;
  }

  separateAsset(assetId: number) {
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

      this.refreshStackThumbnail(asset.stack_id);
      this.db.exec('COMMIT');
      return this.getById(newStackId);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  bulkAddTags(stackIds: number[], tags: string[]) {
    let updated = 0;
    for (const stackId of stackIds) {
      let changed = false;
      for (const tag of tags) {
        if (this.addTag(stackId, tag)) changed = true;
      }
      if (changed) updated++;
    }
    return { success: true, updated };
  }

  bulkSetAuthor(stackIds: number[], author: string) {
    let updated = 0;
    for (const stackId of stackIds) {
      if (this.updateAuthor(stackId, author)) updated++;
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
      if (this.toggleStackFavorite(stackId, favorited)) updated++;
    }
    return { success: true, updated };
  }

  bulkRefreshThumbnails(stackIds: number[]) {
    let updated = 0;
    const errors: string[] = [];
    for (const stackId of stackIds) {
      if (this.refreshStackThumbnail(stackId)) {
        updated++;
      } else {
        errors.push(`Stack ${stackId} not found`);
      }
    }
    return { success: errors.length === 0, updated, errors };
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

  mergeStacks(targetId: number, sourceIds: number[]) {
    const target = this.getStackDataset(targetId);
    if (!target) return null;
    const sources = sourceIds
      .map((sourceId) => this.getStackDataset(sourceId))
      .filter((source): source is { id: number; dataset_id: number } => Boolean(source));
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
      this.refreshStackThumbnail(targetId);
      this.db.prepare('UPDATE stacks SET updated_at = ? WHERE id = ?').run(now, targetId);
      this.db.exec('COMMIT');
      return this.getById(targetId);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getCollectionIdsByStackId(stackId: number) {
    const rows = this.db
      .prepare(
        `SELECT collection_id
         FROM collection_stacks
         WHERE stack_id = ?
         ORDER BY collection_id ASC`
      )
      .all(stackId) as Array<{ collection_id: number }>;
    return { collectionIds: rows.map((row) => row.collection_id) };
  }

  getFavoriteItems(dataSetId: number, limit: number, offset: number) {
    const userId = this.ensureUserId();
    const stackRows = this.db
      .prepare(
        `SELECT
           sf.id AS favorite_id,
           sf.created_at AS favorite_created_at,
           s.id AS stack_id,
           s.name,
           s.thumbnail,
           s.media_type,
           s.liked,
           s.created_at,
           s.updated_at,
           COUNT(a.id) AS asset_count,
           first_asset.thumbnail AS first_asset_thumbnail
         FROM stack_favorites sf
         JOIN stacks s ON s.id = sf.stack_id
         LEFT JOIN assets a ON a.stack_id = s.id
         LEFT JOIN assets first_asset ON first_asset.id = (
           SELECT id FROM assets WHERE stack_id = s.id ORDER BY order_in_stack ASC, id ASC LIMIT 1
         )
         WHERE sf.user_id = ? AND s.dataset_id = ?
         GROUP BY sf.id, s.id`
      )
      .all(userId, dataSetId) as Array<{
      favorite_id: number;
      favorite_created_at: string;
      stack_id: number;
      name: string;
      thumbnail: string;
      media_type: string;
      liked: number;
      created_at: string;
      updated_at: string;
      asset_count: number;
      first_asset_thumbnail: string | null;
    }>;

    const assetRows = this.db
      .prepare(
        `SELECT
           af.id AS favorite_id,
           af.created_at AS favorite_created_at,
           asset.id AS asset_id,
           asset.thumbnail AS asset_thumbnail,
           asset.file AS asset_file,
           asset.order_in_stack,
           s.id AS stack_id,
           s.name,
           s.media_type,
           s.liked,
           s.created_at,
           s.updated_at,
           COUNT(all_assets.id) AS asset_count,
           CASE WHEN sf.id IS NULL THEN 0 ELSE 1 END AS stack_favorited
         FROM asset_favorites af
         JOIN assets asset ON asset.id = af.asset_id
         JOIN stacks s ON s.id = asset.stack_id
         LEFT JOIN assets all_assets ON all_assets.stack_id = s.id
         LEFT JOIN stack_favorites sf ON sf.stack_id = s.id AND sf.user_id = af.user_id
         WHERE af.user_id = ? AND s.dataset_id = ?
         GROUP BY af.id, asset.id, s.id`
      )
      .all(userId, dataSetId) as Array<{
      favorite_id: number;
      favorite_created_at: string;
      asset_id: number;
      asset_thumbnail: string | null;
      asset_file: string;
      order_in_stack: number;
      stack_id: number;
      name: string;
      media_type: string;
      liked: number;
      created_at: string;
      updated_at: string;
      asset_count: number;
      stack_favorited: number;
    }>;

    const combined = [
      ...stackRows.map((row) => {
        const likeCount = Number(row.liked ?? 0);
        return {
          id: row.stack_id,
          stackId: row.stack_id,
          favoriteKind: 'stack' as const,
          favoriteId: row.favorite_id,
          favoriteCreatedAt: row.favorite_created_at,
          name: row.name,
          mediaType: row.media_type,
          thumbnail: toPublicAssetPath(row.first_asset_thumbnail || row.thumbnail, dataSetId),
          favorited: true,
          isFavorite: true,
          liked: likeCount,
          likeCount,
          assetCount: row.asset_count,
          assetsCount: row.asset_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
      ...assetRows.map((row) => {
        const likeCount = Number(row.liked ?? 0);
        return {
          id: `asset:${row.asset_id}`,
          stackId: row.stack_id,
          favoriteKind: 'asset' as const,
          favoriteId: row.favorite_id,
          favoriteCreatedAt: row.favorite_created_at,
          assetId: row.asset_id,
          favoritePage: row.order_in_stack + 1,
          name: row.name,
          mediaType: row.media_type,
          thumbnail: toPublicAssetPath(row.asset_thumbnail || row.asset_file, dataSetId),
          favorited: true,
          isFavorite: true,
          stackFavorited: row.stack_favorited === 1,
          liked: likeCount,
          likeCount,
          assetCount: row.asset_count,
          assetsCount: row.asset_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    ].sort((left, right) => right.favoriteCreatedAt.localeCompare(left.favoriteCreatedAt));

    return {
      stacks: combined.slice(offset, offset + limit),
      total: combined.length,
      limit,
      offset,
    };
  }

  private getAuthorLinks(authorId: number | null) {
    if (authorId === null) return [];
    const rows = this.db
      .prepare(
        `SELECT id, author_id, provider, label, url, external_id, sort_order, created_at, updated_at
         FROM author_links
         WHERE author_id = ?
         ORDER BY sort_order ASC, id ASC`
      )
      .all(authorId) as AuthorLinkRow[];
    return rows.map((link) => ({
      id: link.id,
      authorId: link.author_id,
      provider: link.provider,
      label: link.label,
      url: link.url,
      externalId: link.external_id,
      sortOrder: link.sort_order,
      createdAt: link.created_at,
      updatedAt: link.updated_at,
    }));
  }

  private toStack(row: StackRow, options: { includeAssets?: boolean; includeTags?: boolean } = {}) {
    const assets = options.includeAssets ? this.getAssetsByStackId(row.id, row.dataset_id) : [];
    const tags = options.includeTags ? this.getTagsByStackId(row.id) : undefined;
    const autoTags = this.getAutoTagsByStackId(row.id, row.dataset_id);
    const thumbnail = toPublicAssetPath(assets[0]?.thumbnail || row.thumbnail, row.dataset_id);
    const likeCount = Number(row.liked ?? 0);
    const isFavorite = row.is_favorite === 1;

    return {
      id: row.id,
      dataSetId: row.dataset_id,
      datasetId: String(row.dataset_id),
      authorId: row.author_id,
      author: row.author_name
        ? { id: row.author_id, name: row.author_name, links: this.getAuthorLinks(row.author_id) }
        : null,
      name: row.name,
      thumbnail,
      mediaType: row.media_type,
      liked: likeCount,
      likeCount,
      meta: parseJsonObject(row.meta_json),
      dominantColors: parseJsonArray(row.dominant_colors_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updateAt: row.updated_at,
      assetCount: row.asset_count,
      assetsCount: row.asset_count,
      favorited: isFavorite,
      isFavorite,
      tags,
      autoTags,
      assets: withPublicAssetArray(assets, row.dataset_id),
    };
  }

  private getAutoTagsByStackId(stackId: number, dataSetId: number) {
    const aggregate = this.db
      .prepare('SELECT top_tags_json FROM stack_auto_tag_aggregates WHERE stack_id = ?')
      .get(stackId) as AutoTagAggregateRow | undefined;
    const entries = parseJsonArray(aggregate?.top_tags_json)
      .map(toAutoTagEntry)
      .filter((entry): entry is AutoTagEntry => entry !== null);
    if (entries.length === 0) return [];

    const keys = entries.map((entry) => entry.tag).filter((tag) => tag.length > 0);
    const rows =
      keys.length > 0
        ? (this.db
            .prepare(
              `SELECT m.auto_tag_key, m.display_name, m.tag_id, t.title AS tag_title
               FROM auto_tag_mappings m
               LEFT JOIN tags t ON t.id = m.tag_id
               WHERE m.dataset_id = ?
                 AND m.is_active = 1
                 AND m.auto_tag_key IN (${placeholders(keys)})`
            )
            .all(dataSetId, ...keys) as AutoTagMappingDisplayRow[])
        : [];
    const mappingMap = new Map(rows.map((mapping) => [mapping.auto_tag_key, mapping]));

    return entries.map((entry) => {
      const mapping = mappingMap.get(entry.tag);
      return {
        autoTagKey: entry.tag,
        displayName: mapping?.display_name ?? entry.tag,
        mappedTag:
          mapping?.tag_id && mapping.tag_title
            ? { id: mapping.tag_id, title: mapping.tag_title }
            : null,
        score: entry.score,
      };
    });
  }

  private getTagsByStackId(stackId: number) {
    return this.db
      .prepare(
        `SELECT t.id, t.title
         FROM tags t
         JOIN stack_tags st ON st.tag_id = t.id
         WHERE st.stack_id = ?
         ORDER BY t.title ASC`
      )
      .all(stackId) as TagRow[];
  }

  private stackExists(stackId: number) {
    return Boolean(this.db.prepare('SELECT id FROM stacks WHERE id = ?').get(stackId));
  }

  private getStackDataset(stackId: number) {
    return this.db.prepare('SELECT id, dataset_id FROM stacks WHERE id = ?').get(stackId) as
      | { id: number; dataset_id: number }
      | undefined;
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

  private findOrCreateAuthor(dataSetId: number, name: string) {
    const existing = this.db
      .prepare('SELECT id FROM authors WHERE dataset_id = ? AND name = ? COLLATE NOCASE')
      .get(dataSetId, name) as { id: number } | undefined;
    if (existing) return existing.id;
    return Number(
      this.db.prepare('INSERT INTO authors (dataset_id, name) VALUES (?, ?)').run(dataSetId, name)
        .lastInsertRowid
    );
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

  private async extractAssetColors(fileKey: string, thumbnailKey: string, ext: string) {
    try {
      if (isImageExtension(ext)) {
        return await ColorExtractor.extractDominantColors(DataStorage.getPath(fileKey), 3);
      }
      if (isVideoExtension(ext) && thumbnailKey) {
        return await ColorExtractor.extractDominantColors(DataStorage.getPath(thumbnailKey), 3);
      }
    } catch (error) {
      console.error('Failed to extract colors for standalone asset upload', error);
    }
    return null;
  }

  private replaceAssetColors(assetId: number, colors: DominantColor[] | null) {
    this.db.prepare('DELETE FROM asset_colors WHERE asset_id = ?').run(assetId);
    if (!colors || colors.length === 0) return;
    const insert = this.db.prepare(
      `INSERT INTO asset_colors
         (asset_id, r, g, b, hex, percentage, hue, saturation, lightness, hue_category, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    colors.forEach((color, index) => {
      insert.run(
        assetId,
        color.r,
        color.g,
        color.b,
        color.hex,
        color.percentage,
        color.hue,
        color.saturation,
        color.lightness,
        color.hueCategory,
        index
      );
    });
  }

  private replaceStackColors(stackId: number, colors: DominantColor[] | null) {
    this.db.prepare('DELETE FROM stack_colors WHERE stack_id = ?').run(stackId);
    if (!colors || colors.length === 0) return;
    const insert = this.db.prepare(
      `INSERT INTO stack_colors
         (stack_id, r, g, b, hex, percentage, hue, saturation, lightness, hue_category, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    colors.forEach((color, index) => {
      insert.run(
        stackId,
        color.r,
        color.g,
        color.b,
        color.hex,
        color.percentage,
        color.hue,
        color.saturation,
        color.lightness,
        color.hueCategory,
        index
      );
    });
  }

  private refreshStackColors(stackId: number) {
    const rows = this.db
      .prepare(
        `SELECT dominant_colors_json
         FROM assets
         WHERE stack_id = ?
         ORDER BY order_in_stack ASC, id ASC`
      )
      .all(stackId) as Array<{ dominant_colors_json: string | null }>;
    const colorSets = rows
      .map((row) => parseJsonArray(row.dominant_colors_json).filter(this.isDominantColor))
      .filter((colors) => colors.length > 0);
    const colors = colorSets.length > 0 ? ColorExtractor.aggregateStackColors(colorSets) : null;
    this.db
      .prepare('UPDATE stacks SET dominant_colors_json = ?, updated_at = ? WHERE id = ?')
      .run(toColorJson(colors), nowIso(), stackId);
    this.replaceStackColors(stackId, colors);
  }

  private isDominantColor(value: unknown): value is DominantColor {
    if (!value || typeof value !== 'object') return false;
    const color = value as Partial<DominantColor>;
    return (
      typeof color.r === 'number' &&
      typeof color.g === 'number' &&
      typeof color.b === 'number' &&
      typeof color.hex === 'string' &&
      typeof color.percentage === 'number' &&
      typeof color.hue === 'number' &&
      typeof color.saturation === 'number' &&
      typeof color.lightness === 'number' &&
      typeof color.hueCategory === 'string'
    );
  }

  private getExistingStackIds(dataSetId: number, stackIds: number[]) {
    if (stackIds.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT id
         FROM stacks
         WHERE dataset_id = ?
           AND id IN (${placeholders(stackIds)})`
      )
      .all(dataSetId, ...stackIds) as Array<{ id: number }>;
    const existing = new Set(rows.map((row) => row.id));
    return stackIds.filter((id) => existing.has(id));
  }

  private getAutoTagVectors(dataSetId: number, stackIds: number[], stopTags: Set<string>) {
    if (stackIds.length === 0) return new Map<number, Map<string, number>>();
    const rows = this.db
      .prepare(
        `SELECT scores.stack_id, lower(scores.tag_key) AS tag_key, scores.score
         FROM stack_auto_tag_scores scores
         JOIN stacks s ON s.id = scores.stack_id
         WHERE s.dataset_id = ?
           AND scores.stack_id IN (${placeholders(stackIds)})
           AND scores.score >= ?
         ORDER BY scores.stack_id ASC, scores.score DESC, scores.rank ASC`
      )
      .all(dataSetId, ...stackIds, SIMILAR_CONFIG.autoMinScore) as AutoTagScoreRow[];

    const vectors = new Map<number, Map<string, number>>();
    for (const row of rows) {
      const tag = normalizeTag(row.tag_key);
      if (!tag || stopTags.has(tag)) continue;
      const vector = vectors.get(row.stack_id) ?? new Map<string, number>();
      if (vector.size >= SIMILAR_CONFIG.autoTopN || vector.has(tag)) {
        vectors.set(row.stack_id, vector);
        continue;
      }
      vector.set(tag, row.score);
      vectors.set(row.stack_id, vector);
    }
    return vectors;
  }

  private getManualTagSets(dataSetId: number, stackIds: number[], stopTags: Set<string>) {
    if (stackIds.length === 0) return new Map<number, Set<string>>();
    const rows = this.db
      .prepare(
        `SELECT st.stack_id, t.title
         FROM stack_tags st
         JOIN tags t ON t.id = st.tag_id
         JOIN stacks s ON s.id = st.stack_id
         WHERE s.dataset_id = ?
           AND st.stack_id IN (${placeholders(stackIds)})
         ORDER BY st.stack_id ASC, t.title ASC`
      )
      .all(dataSetId, ...stackIds) as ManualTagRow[];

    const sets = new Map<number, Set<string>>();
    for (const row of rows) {
      const tag = normalizeTag(row.title);
      if (!tag || stopTags.has(tag)) continue;
      const set = sets.get(row.stack_id) ?? new Set<string>();
      if (set.size < SIMILAR_CONFIG.manualTopN) set.add(tag);
      sets.set(row.stack_id, set);
    }
    return sets;
  }

  private buildSimilarReference(
    dataSetId: number,
    stackIds: number[],
    stopTags: Set<string>
  ): SimilarVectors {
    const autoVectors = this.getAutoTagVectors(dataSetId, stackIds, stopTags);
    const manualSets = this.getManualTagSets(dataSetId, stackIds, stopTags);
    const autoScores = new Map<string, number>();

    for (const vector of autoVectors.values()) {
      for (const [tag, score] of vector) {
        autoScores.set(tag, (autoScores.get(tag) ?? 0) + score);
      }
    }

    const sourceCount = Math.max(stackIds.length, 1);
    const auto = new Map(
      Array.from(autoScores.entries())
        .map(([tag, score]) => [tag, Math.min(1, score / sourceCount)] as const)
        .filter(([, score]) => score > 0)
        .sort((left, right) => right[1] - left[1])
        .slice(0, SIMILAR_CONFIG.autoTopN)
    );

    const manualCounts = new Map<string, number>();
    for (const stackId of stackIds) {
      const tags = manualSets.get(stackId);
      if (!tags) continue;
      for (const tag of tags) {
        manualCounts.set(tag, (manualCounts.get(tag) ?? 0) + 1);
      }
    }

    const manual = new Set(
      Array.from(manualCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, SIMILAR_CONFIG.manualTopN)
        .map(([tag]) => tag)
    );

    return { auto, manual };
  }

  private getAutoCandidateIds(dataSetId: number, autoTags: string[], excludedStackIds: number[]) {
    if (autoTags.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT DISTINCT scores.stack_id AS id
         FROM stack_auto_tag_scores scores
         JOIN stacks s ON s.id = scores.stack_id
         WHERE s.dataset_id = ?
           AND scores.score >= ?
           AND lower(scores.tag_key) IN (${placeholders(autoTags)})
           AND scores.stack_id NOT IN (${placeholders(excludedStackIds)})
         LIMIT ?`
      )
      .all(
        dataSetId,
        SIMILAR_CONFIG.autoMinScore,
        ...autoTags,
        ...excludedStackIds,
        SIMILAR_CONFIG.candidateLimit
      ) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  private getManualCandidateIds(dataSetId: number, tags: string[], excludedStackIds: number[]) {
    if (tags.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT DISTINCT st.stack_id AS id
         FROM stack_tags st
         JOIN tags t ON t.id = st.tag_id
         JOIN stacks s ON s.id = st.stack_id
         WHERE s.dataset_id = ?
           AND lower(t.title) IN (${placeholders(tags)})
           AND st.stack_id NOT IN (${placeholders(excludedStackIds)})
         LIMIT ?`
      )
      .all(dataSetId, ...tags, ...excludedStackIds, SIMILAR_CONFIG.candidateLimit) as Array<{
      id: number;
    }>;
    return rows.map((row) => row.id);
  }

  private getDatasetStackCount(dataSetId: number) {
    return (
      (
        this.db
          .prepare('SELECT COUNT(*) AS count FROM stacks WHERE dataset_id = ?')
          .get(dataSetId) as CountRow | undefined
      )?.count ?? 0
    );
  }

  private getAutoDocumentFrequency(dataSetId: number, tags: string[]) {
    if (tags.length === 0) return new Map<string, number>();
    const rows = this.db
      .prepare(
        `SELECT lower(scores.tag_key) AS tag_key, COUNT(DISTINCT scores.stack_id) AS count
         FROM stack_auto_tag_scores scores
         JOIN stacks s ON s.id = scores.stack_id
         WHERE s.dataset_id = ?
           AND scores.score >= ?
           AND lower(scores.tag_key) IN (${placeholders(tags)})
         GROUP BY lower(scores.tag_key)`
      )
      .all(dataSetId, SIMILAR_CONFIG.autoMinScore, ...tags) as DocumentFrequencyRow[];
    return new Map(rows.map((row) => [row.tag_key, row.count]));
  }

  private getManualDocumentFrequency(dataSetId: number, tags: string[]) {
    if (tags.length === 0) return new Map<string, number>();
    const rows = this.db
      .prepare(
        `SELECT lower(t.title) AS tag_key, COUNT(DISTINCT st.stack_id) AS count
         FROM stack_tags st
         JOIN tags t ON t.id = st.tag_id
         JOIN stacks s ON s.id = st.stack_id
         WHERE s.dataset_id = ?
           AND lower(t.title) IN (${placeholders(tags)})
         GROUP BY lower(t.title)`
      )
      .all(dataSetId, ...tags) as DocumentFrequencyRow[];
    return new Map(rows.map((row) => [row.tag_key, row.count]));
  }

  private getSimilarIdfWeight(
    tag: string,
    hasManual: boolean,
    autoDf: Map<string, number>,
    manualDf: Map<string, number>,
    datasetSize: number
  ) {
    const df = autoDf.get(tag) || (hasManual ? (manualDf.get(tag) ?? 0) : 0);
    const base = Math.log((Math.max(datasetSize, 1) + 1) / (df + 1));
    const weight = Number.isFinite(base)
      ? Math.max(base, SIMILAR_CONFIG.minIdf)
      : SIMILAR_CONFIG.minIdf;
    return hasManual ? weight * SIMILAR_CONFIG.manualWeightMultiplierOnIdf : weight;
  }

  private runSimilarSearch(
    dataSetId: number,
    reference: SimilarVectors,
    excludedStackIds: number[],
    stopTags: Set<string>,
    options: { threshold?: number }
  ) {
    if (reference.auto.size === 0 && reference.manual.size === 0) return [];

    const autoProbe = Array.from(reference.auto.keys()).slice(0, SIMILAR_CONFIG.autoProbeCount);
    const manualProbe = Array.from(reference.manual);
    const candidateIds = Array.from(
      new Set([
        ...this.getAutoCandidateIds(dataSetId, autoProbe, excludedStackIds),
        ...this.getManualCandidateIds(dataSetId, manualProbe, excludedStackIds),
      ])
    );
    if (candidateIds.length === 0) return [];

    const autoVectors = this.getAutoTagVectors(dataSetId, candidateIds, stopTags);
    const manualSets = this.getManualTagSets(dataSetId, candidateIds, stopTags);
    const autoUniverse = new Set(reference.auto.keys());
    const manualUniverse = new Set(reference.manual);
    const candidates = candidateIds
      .map((stackId) => ({
        stackId,
        auto: autoVectors.get(stackId) ?? new Map<string, number>(),
        manual: manualSets.get(stackId) ?? new Set<string>(),
      }))
      .filter((candidate) => candidate.auto.size > 0 || candidate.manual.size > 0);

    for (const candidate of candidates) {
      for (const tag of candidate.auto.keys()) autoUniverse.add(tag);
      for (const tag of candidate.manual) manualUniverse.add(tag);
    }

    const datasetSize = this.getDatasetStackCount(dataSetId);
    const autoDf = this.getAutoDocumentFrequency(dataSetId, Array.from(autoUniverse));
    const manualDf = this.getManualDocumentFrequency(dataSetId, Array.from(manualUniverse));
    const scores = new Map<number, number>();

    for (const candidate of candidates) {
      const union = new Set([
        ...reference.auto.keys(),
        ...candidate.auto.keys(),
        ...reference.manual,
        ...candidate.manual,
      ]);
      let numerator = 0;
      let denominator = 0;

      for (const tag of union) {
        const refAutoVal = reference.auto.get(tag) ?? 0;
        const candAutoVal = candidate.auto.get(tag) ?? 0;
        const refManualVal = reference.manual.has(tag) ? 1 : 0;
        const candManualVal = candidate.manual.has(tag) ? 1 : 0;
        if (!refAutoVal && !candAutoVal && !refManualVal && !candManualVal) continue;

        const refValue =
          SIMILAR_CONFIG.autoWeight * refAutoVal + SIMILAR_CONFIG.manualWeight * refManualVal;
        const candValue =
          SIMILAR_CONFIG.autoWeight * candAutoVal + SIMILAR_CONFIG.manualWeight * candManualVal;
        if (!refValue && !candValue) continue;

        const weight = this.getSimilarIdfWeight(
          tag,
          Boolean(refManualVal || candManualVal),
          autoDf,
          manualDf,
          datasetSize
        );
        numerator += weight * Math.min(refValue, candValue);
        denominator += weight * Math.max(refValue, candValue);
      }

      const score = denominator > 0 ? numerator / denominator : 0;
      if (score > 0) scores.set(candidate.stackId, score);
    }

    const threshold = clamp01(options.threshold ?? 0);
    return Array.from(scores.entries())
      .filter(([, score]) => score >= threshold)
      .sort((left, right) => right[1] - left[1])
      .slice(0, SIMILAR_CONFIG.resultLimit)
      .map(([id]) => id);
  }

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
