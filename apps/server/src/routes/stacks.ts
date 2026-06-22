import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { DuplicateAssetError } from '../errors/DuplicateAssetError';
import { ensureDatasetAuthorizedForCurrentStore } from '../repositories/sqlite/auth';
import { StandaloneAutoTagRepository } from '../repositories/sqlite/auto-tag-repository';
import { StandaloneColorRepository } from '../repositories/sqlite/color-repository';
import { StandaloneLibraryRepository } from '../repositories/sqlite/library-repository';
import {
  type StandaloneStackListParams,
  StandaloneStackRepository,
} from '../repositories/sqlite/stack-repository';
import { useDataStorage } from '../shared/di';
import { createZipArchive } from '../utils/zip';

export const stacksRoute = new Hono();

const MediaCategorySchema = z.enum(['image', 'comic', 'video']);
type MediaCategory = z.infer<typeof MediaCategorySchema>;
const ActualMediaTypeSchema = z.enum(['image', 'video', 'multipleImages']);
const ActualMediaTypesQuerySchema = z
  .union([ActualMediaTypeSchema, z.array(ActualMediaTypeSchema)])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return Array.isArray(value) ? value : [value];
  });
type ImportedFile = {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
};

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

const stackRepository = new StandaloneStackRepository();
const libraryRepository = new StandaloneLibraryRepository();
const autoTagRepository = new StandaloneAutoTagRepository();
const colorRepository = new StandaloneColorRepository();

const PaginatedQuerySchema = z.object({
  dataSetId: z.coerce.number().int().positive(),
  collection: z.coerce.number().int().positive().optional(),
  mediaCategory: MediaCategorySchema.optional(),
  mediaTypes: ActualMediaTypesQuerySchema,
  tag: z.union([z.array(z.string()), z.string()]).optional(),
  author: z.union([z.array(z.string()), z.string()]).optional(),
  fav: z.enum(['0', '1']).optional(),
  liked: z.enum(['0', '1']).optional(),
  hasNoTags: z.coerce.boolean().optional(),
  hasNoAuthor: z.coerce.boolean().optional(),
  search: z.string().optional(),
  hueCategories: z.union([z.array(z.string()), z.string()]).optional(),
  toneSaturation: z.coerce.number().int().min(0).max(100).optional(),
  toneLightness: z.coerce.number().int().min(0).max(100).optional(),
  toneTolerance: z.coerce.number().int().min(0).max(100).optional(),
  similarityThreshold: z.coerce.number().int().min(0).max(100).optional(),
  customColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  sort: z
    .enum(['recommended', 'dateAdded', 'name', 'likes', 'updated', 'id'])
    .optional()
    .default('recommended'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const FavoriteListQuerySchema = z.object({
  dataSetId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const DownloadOriginalsQuerySchema = z.object({
  dataSetId: z.coerce.number().int().positive(),
  stackIds: z.union([z.string(), z.array(z.string())]).optional(),
  assetIds: z.union([z.string(), z.array(z.string())]).optional(),
});

const AutoTagSearchQuerySchema = z.object({
  dataSetId: z.coerce.number().int().positive(),
  autoTag: z.union([z.array(z.string()), z.string()]),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  search: z.string().optional(),
  mediaCategory: MediaCategorySchema.optional(),
  mediaTypes: ActualMediaTypesQuerySchema,
  author: z.union([z.array(z.string()), z.string()]).optional(),
  tag: z.union([z.array(z.string()), z.string()]).optional(),
  fav: z.enum(['0', '1']).optional(),
  liked: z.enum(['0', '1']).optional(),
  hasNoTags: z.coerce.boolean().optional(),
  hasNoAuthor: z.coerce.boolean().optional(),
});

const BulkTagsSchema = z.object({
  stackIds: z.array(z.number().int().positive()),
  tags: z.array(z.string().min(1)),
});
const BulkAuthorSchema = z.object({
  stackIds: z.array(z.number().int().positive()),
  author: z.string().min(1),
});
const BulkMediaTypeSchema = z.object({
  stackIds: z.array(z.number().int().positive()),
  mediaType: MediaCategorySchema,
});
const BulkFavoriteSchema = z.object({
  stackIds: z.array(z.number().int().positive()),
  favorited: z.boolean(),
});
const BulkRefreshThumbsSchema = z.object({ stackIds: z.array(z.number().int().positive()) });
const BulkRemoveSchema = z.object({ stackIds: z.array(z.number().int().positive()) });
const SetThumbnailSourceSchema = z.object({
  dataSetId: z.coerce.number().int().positive().optional(),
  datasetId: z.coerce.number().int().positive().optional(),
  assetId: z.coerce.number().int().positive(),
  pageNumber: z.coerce.number().int().positive().optional(),
  timeSeconds: z.coerce.number().min(0).optional(),
});
const MergeStacksSchema = z.object({
  targetId: z.number().int().positive(),
  sourceIds: z.array(z.number().int().positive()).min(1),
});

const ImportFromUrlsSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(20),
  dataSetId: z.number().int().positive().optional(),
  stackId: z.number().int().positive().optional(),
  mediaType: MediaCategorySchema.optional(),
  collectionId: z.number().int().positive().optional(),
  author: z.string().min(1).max(200).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const normalizeStringArray = (value: string | string[] | undefined) => {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
};

const isUploadedFile = (value: unknown): value is UploadedFile => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<UploadedFile> & { arrayBuffer?: unknown };
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.arrayBuffer === 'function'
  );
};

const getQueryObject = (c: Context): Record<string, string | string[]> => {
  const searchParams = new URL(c.req.url).searchParams;
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams.entries()) {
    if (result[key] === undefined) {
      result[key] = value;
    } else {
      result[key] = Array.isArray(result[key])
        ? [...result[key], value]
        : [result[key] as string, value];
    }
  }
  return result;
};

const parseIds = (value: string | string[]) => {
  const rawValues = Array.isArray(value) ? value : [value];
  const ids: number[] = [];
  const seen = new Set<number>();

  for (const rawValue of rawValues) {
    for (const part of rawValue.split(',')) {
      const parsed = Number.parseInt(part.trim(), 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || seen.has(parsed)) continue;
      seen.add(parsed);
      ids.push(parsed);
    }
  }

  return ids;
};

const getStandaloneColorStackIds = (options: {
  dataSetId: number;
  mediaCategory?: MediaCategory;
  hueCategories?: string | string[];
  toneSaturation?: number;
  toneLightness?: number;
  toneTolerance?: number;
  similarityThreshold?: number;
  customColor?: string;
}) => {
  const hueCategories = normalizeStringArray(options.hueCategories);
  const tonePoint =
    typeof options.toneSaturation === 'number' && typeof options.toneLightness === 'number'
      ? { saturation: options.toneSaturation, lightness: options.toneLightness }
      : undefined;
  const hasColorFilter =
    Boolean(hueCategories?.length) || Boolean(tonePoint) || Boolean(options.customColor);

  if (!hasColorFilter) return undefined;

  return colorRepository.getMatchingStackIdsByFilter({
    dataSetId: options.dataSetId,
    mediaType: options.mediaCategory,
    hueCategories,
    tonePoint,
    toneTolerance: options.toneTolerance,
    similarityThreshold: options.similarityThreshold,
    customColor: options.customColor,
  });
};

const getAttachmentDisposition = (filename: string) => {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};

const getContentType = (filename: string, fileType?: string | null) => {
  if (fileType?.startsWith('image/')) return fileType;
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.svgz': 'image/svg+xml',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.ai': 'application/pdf',
  };
  return types[ext] ?? fileType ?? 'application/octet-stream';
};

const toResponseBody = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const getDownloadFilename = (originalName: string | null | undefined, file: string) => {
  const name = originalName?.trim() || path.basename(file);
  const withoutPathSeparators = name.replace(/[\\/]/g, '_');
  const sanitized = Array.from(withoutPathSeparators)
    .map((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? '_' : char;
    })
    .join('');
  return sanitized || 'download';
};

const getUniqueFilename = (filename: string, usedNames: Map<string, number>): string => {
  const usedCount = usedNames.get(filename) ?? 0;
  usedNames.set(filename, usedCount + 1);
  if (usedCount === 0) return filename;

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  return getUniqueFilename(`${base} (${usedCount + 1})${ext}`, usedNames);
};

const getPdfProcessingErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return null;
  return error.message.includes('PDF') ? error.message : null;
};

const resolveStoredFilePath = (
  file: string,
  dataStorage: ReturnType<typeof useDataStorage>
): string | null => {
  const normalized = file.replace(/^\/files\//, '').replace(/^files\//, '');
  const raw = file.startsWith('/') ? file.slice(1) : file;
  const candidates = Array.from(
    new Set([normalized, raw, `assets/${normalized}`, `assets/${raw}`])
  );

  for (const candidate of candidates) {
    const fullPath = dataStorage.getPath(candidate);
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
      }
    } catch {}
  }

  return null;
};

const sanitizeFileNameForStorage = (name: string) => {
  const withoutControl = Array.from(name)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
  const sanitized = withoutControl.replace(/[\\/:*?"<>|]+/g, '_').trim();
  if (sanitized.length > 0) {
    return sanitized.length > 200 ? sanitized.slice(-200) : sanitized;
  }
  return `remote-${Date.now()}`;
};

const resolveFileNameFromHeaders = (urlString: string, contentDisposition: string | null) => {
  if (contentDisposition) {
    const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
      try {
        return decodeURIComponent(encodedMatch[1]);
      } catch {}
    }
    const quotedMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (quotedMatch?.[1]) {
      try {
        return decodeURIComponent(quotedMatch[1]);
      } catch {
        return quotedMatch[1];
      }
    }
  }

  try {
    const target = new URL(urlString);
    const base = target.pathname.split('/').filter(Boolean).pop() ?? '';
    return base || `remote-${Date.now()}`;
  } catch {
    return `remote-${Date.now()}`;
  }
};

const inferMediaTypeFromMime = (
  mime: string | null | undefined,
  originalName: string
): MediaCategory => {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.ai' || ext === '.svg' || ext === '.svgz') return 'image';
  if (ext === '.pdf') return 'comic';
  if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.mpeg', '.mpg'].includes(ext)) return 'video';
  if (mime?.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'comic';
  return 'image';
};

const lookupMimeFromExtension = (originalName: string): string | null => {
  const ext = path.extname(originalName).toLowerCase();
  if (!ext) return null;
  const mapping: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.svgz': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.heic': 'image/heic',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.pdf': 'application/pdf',
    '.ai': 'application/pdf',
  };
  return mapping[ext] ?? null;
};

const downloadRemoteAsset = async (url: string, tmpDir: string): Promise<ImportedFile> => {
  const targetUrl = new URL(url);
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36',
  };

  if (targetUrl.hostname.endsWith('pximg.net')) {
    headers.Referer = 'https://www.pixiv.net/';
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}で取得に失敗しました`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('空のファイルが返却されました');
  }

  const rawName = resolveFileNameFromHeaders(url, response.headers.get('content-disposition'));
  const sanitizedName = sanitizeFileNameForStorage(rawName.split('?')[0] ?? rawName);
  const tmpPath = path.join(
    tmpDir,
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${sanitizedName}`
  );
  fs.writeFileSync(tmpPath, buffer);

  const headerMime = response.headers.get('content-type');
  const lookedUp = lookupMimeFromExtension(sanitizedName);
  const mimetype =
    headerMime && headerMime !== 'application/octet-stream'
      ? headerMime
      : (lookedUp ?? 'application/octet-stream');

  return {
    path: tmpPath,
    originalname: sanitizedName,
    mimetype,
    size: buffer.length,
  };
};

const copyLocalAssetFromFileUrl = (url: string, tmpDir: string): ImportedFile => {
  const sourcePath = fileURLToPath(new URL(url));
  let stat: fs.Stats;
  try {
    stat = fs.statSync(sourcePath);
  } catch {
    throw new Error('ローカルファイルが見つかりません');
  }

  if (!stat.isFile()) {
    throw new Error('ローカルファイルのみドロップできます');
  }

  const originalname = sanitizeFileNameForStorage(path.basename(sourcePath));
  const tmpPath = path.join(
    tmpDir,
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${originalname}`
  );
  fs.copyFileSync(sourcePath, tmpPath);

  return {
    path: tmpPath,
    originalname,
    mimetype: lookupMimeFromExtension(originalname) ?? 'application/octet-stream',
    size: stat.size,
  };
};

const importAssetFromUrl = async (url: string, tmpDir: string) => {
  const targetUrl = new URL(url);

  if (targetUrl.protocol === 'file:') {
    return copyLocalAssetFromFileUrl(url, tmpDir);
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    throw new Error('未対応のURLスキームです');
  }

  return downloadRemoteAsset(url, tmpDir);
};

const scheduleStandaloneAutoTagPrediction = (asset: { id?: number } | null) => {
  const assetId = Number(asset?.id ?? 0);
  if (!assetId) return;
  void autoTagRepository.predictAssetTags(assetId, 0.4).catch((error) => {
    console.error(`Failed to predict standalone AutoTags for asset ${assetId}:`, error);
  });
};

stacksRoute.get('/download-originals', async (c) => {
  const parse = DownloadOriginalsQuerySchema.safeParse(getQueryObject(c));
  if (!parse.success) return c.json({ error: 'Invalid query', details: parse.error }, 400);

  const { dataSetId } = parse.data;
  const stackIds = parse.data.stackIds ? parseIds(parse.data.stackIds) : [];
  const assetIds = parse.data.assetIds ? parseIds(parse.data.assetIds) : [];
  if (stackIds.length === 0 && assetIds.length === 0) {
    return c.json({ error: 'No stack or asset ids specified' }, 400);
  }

  const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
  if (auth) return auth;

  const orderedAssets = stackRepository.getOriginalAssets(dataSetId, { stackIds, assetIds });
  if (orderedAssets.length === 0) {
    return c.json({ error: 'Original files not found' }, 404);
  }

  const dataStorage = useDataStorage(c);
  const downloadableAssets: Array<(typeof orderedAssets)[number] & { filePath: string }> = [];
  for (const asset of orderedAssets) {
    const filePath = resolveStoredFilePath(asset.file, dataStorage);
    if (!filePath) {
      return c.json({ error: 'Original file missing', assetId: asset.id }, 404);
    }
    downloadableAssets.push({ ...asset, filePath });
  }

  if (downloadableAssets.length === 1) {
    const asset = downloadableAssets[0];
    const filename = getDownloadFilename(asset.originalName, asset.file);
    const data = fs.readFileSync(asset.filePath);
    return new Response(toResponseBody(data), {
      headers: {
        'Content-Type': getContentType(filename, asset.fileType),
        'Content-Disposition': getAttachmentDisposition(filename),
        'Content-Length': data.length.toString(),
        'Cache-Control': 'no-store',
      },
    });
  }

  const usedNames = new Map<string, number>();
  const zipEntries = downloadableAssets.map((asset) => ({
    name: getUniqueFilename(getDownloadFilename(asset.originalName, asset.file), usedNames),
    data: fs.readFileSync(asset.filePath),
  }));
  const zip = createZipArchive(zipEntries);
  const zipFilename =
    stackIds.length === 1 && assetIds.length === 0
      ? `stack-${stackIds[0]}-originals.zip`
      : 'originals.zip';

  return new Response(toResponseBody(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': getAttachmentDisposition(zipFilename),
      'Content-Length': zip.length.toString(),
      'Cache-Control': 'no-store',
    },
  });
});

stacksRoute.get('/paginated', async (c) => {
  const parse = PaginatedQuerySchema.safeParse(getQueryObject(c));
  if (!parse.success) return c.json({ error: 'Invalid query', details: parse.error }, 400);

  const query = parse.data;
  const stackListParams: StandaloneStackListParams = {
    dataSetId: query.dataSetId,
    collection: query.collection,
    mediaCategory: query.mediaCategory,
    mediaTypes: query.mediaTypes,
    tag: query.tag,
    author: query.author,
    fav: query.fav,
    liked: query.liked,
    hasNoTags: query.hasNoTags,
    hasNoAuthor: query.hasNoAuthor,
    search: query.search,
    sort: query.sort,
    order: query.order,
    limit: query.limit,
    offset: query.offset,
  };

  const auth = await ensureDatasetAuthorizedForCurrentStore(c, stackListParams.dataSetId);
  if (auth) return auth;

  const stackIds = getStandaloneColorStackIds({
    dataSetId: stackListParams.dataSetId,
    mediaCategory: stackListParams.mediaCategory,
    hueCategories: query.hueCategories,
    toneSaturation: query.toneSaturation,
    toneLightness: query.toneLightness,
    toneTolerance: query.toneTolerance,
    similarityThreshold: query.similarityThreshold,
    customColor: query.customColor,
  });
  const result = stackRepository.getPaginated({
    ...stackListParams,
    stackIds,
  });
  return c.json(result);
});

stacksRoute.get('/favorites/list', async (c) => {
  const parse = FavoriteListQuerySchema.safeParse(getQueryObject(c));
  if (!parse.success) return c.json({ error: 'Invalid query', details: parse.error }, 400);

  const { dataSetId, limit, offset } = parse.data;
  const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
  if (auth) return auth;

  return c.json(stackRepository.getFavoriteItems(dataSetId, limit, offset));
});

stacksRoute.get('/search/autotag', async (c) => {
  const parsed = AutoTagSearchQuerySchema.safeParse(getQueryObject(c));
  if (!parsed.success) {
    return c.json({ error: 'Invalid query', details: parsed.error }, 400);
  }

  const {
    dataSetId,
    autoTag,
    limit,
    offset,
    search,
    mediaCategory,
    mediaTypes,
    author,
    tag,
    fav,
    liked,
    hasNoTags,
    hasNoAuthor,
  } = parsed.data;
  const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
  if (auth) return auth;
  const tags = Array.isArray(autoTag) ? autoTag : [autoTag];
  const stackIds = autoTagRepository.getMatchingStackIds(dataSetId, tags);
  return c.json(
    stackRepository.getPaginated({
      dataSetId,
      stackIds,
      limit,
      offset,
      search,
      mediaCategory,
      mediaTypes,
      author,
      tag,
      fav,
      liked,
      hasNoTags,
      hasNoAuthor,
      sort: 'id',
      order: 'desc',
    })
  );
});

stacksRoute.post('/:id{[0-9]+}/like', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const result = stackRepository.likeStack(id);
  if (!result) return c.json({ error: 'Stack not found' }, 404);
  return c.json({ success: true, liked: result.liked });
});

stacksRoute.put('/:id{[0-9]+}/favorite', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const favorited =
    typeof body === 'object' &&
    body !== null &&
    'favorited' in body &&
    typeof body.favorited === 'boolean'
      ? body.favorited
      : false;
  const ok = stackRepository.toggleStackFavorite(id, favorited);
  if (!ok) return c.json({ error: 'Stack not found' }, 404);
  return c.json({ success: true, favorited });
});

stacksRoute.post('/:id{[0-9]+}/refresh-thumbnail', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const stack = await stackRepository.refreshStackThumbnail(id);
  if (!stack) return c.json({ error: 'Stack not found' }, 404);
  return c.json(stack);
});

stacksRoute.post('/:id{[0-9]+}/thumbnail-source', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const parse = SetThumbnailSourceSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);

  const dataSetId = parse.data.dataSetId ?? parse.data.datasetId;
  if (dataSetId !== undefined) {
    const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
    if (auth) return auth;
    if (!stackRepository.stackBelongsToDataset(id, dataSetId)) {
      return c.json({ error: 'Stack not found' }, 404);
    }
  }

  try {
    const result = await stackRepository.setStackThumbnailSource(id, {
      assetId: parse.data.assetId,
      pageNumber: parse.data.pageNumber,
      timeSeconds: parse.data.timeSeconds,
    });
    if (!result) return c.json({ error: 'Thumbnail source not found' }, 404);
    return c.json(result);
  } catch (error) {
    console.error('Error setting stack thumbnail source:', error);
    return c.json({ error: 'Failed to set stack thumbnail source' }, 500);
  }
});

stacksRoute.post('/:id{[0-9]+}/aggregate-tags', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  try {
    const result = autoTagRepository.aggregateStackTags(id, 0.4);
    return c.json(result);
  } catch (error) {
    console.error('Error aggregating AutoTags:', error);
    return c.json({ error: 'Failed to aggregate AutoTags' }, 500);
  }
});

stacksRoute.post('/:id{[0-9]+}/refresh-autotags', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  try {
    const result = await autoTagRepository.refreshStackTags(id, {
      threshold: 0.4,
      forceRegenerate: true,
    });
    return c.json(result);
  } catch (error) {
    console.error('Error refreshing AutoTags:', error);
    return c.json({ error: 'Failed to refresh AutoTags' }, 500);
  }
});

stacksRoute.post('/:id{[0-9]+}/tags', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const tag =
    typeof body === 'object' && body !== null && 'tag' in body && typeof body.tag === 'string'
      ? body.tag
      : '';
  if (!tag) return c.json({ error: 'Tag is required' }, 400);
  stackRepository.addTag(id, tag);
  return c.json({ success: true });
});

stacksRoute.delete('/:id{[0-9]+}/tags/:tag', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const tag = c.req.param('tag');
  stackRepository.removeTag(id, tag);
  return c.json({ success: true });
});

stacksRoute.post('/:id{[0-9]+}/assets', async (c) => {
  const stackId = Number.parseInt(c.req.param('id'), 10);
  const formData = await c.req.formData();
  const fileEntry = formData.get('file');
  if (!isUploadedFile(fileEntry)) return c.json({ error: 'File is required' }, 400);
  const file = fileEntry;

  const stack = stackRepository.getById(stackId);
  if (!stack) return c.json({ error: 'Stack not found' }, 404);
  const auth = await ensureDatasetAuthorizedForCurrentStore(c, stack.dataSetId);
  if (auth) return auth;

  const storageRoot = process.env.FILES_STORAGE || path.resolve('./data');
  const tmpDir = path.join(storageRoot, 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `${Date.now()}-${file.name || 'upload'}`);
  fs.writeFileSync(tmpPath, new Uint8Array(await file.arrayBuffer()));

  try {
    const asset = await stackRepository.addAssetWithFile(stackId, {
      path: tmpPath,
      originalname: file.name,
      mimetype: file.type,
      size: file.size,
    });
    scheduleStandaloneAutoTagPrediction(asset);
    return c.json(asset, 201);
  } catch (error) {
    if (error instanceof DuplicateAssetError) {
      return c.json({ error: error.message, code: error.code, details: error.details }, 409);
    }
    const pdfErrorMessage = getPdfProcessingErrorMessage(error);
    if (pdfErrorMessage) return c.json({ error: pdfErrorMessage }, 400);
    throw error;
  }
});

stacksRoute.get('/:id{[0-9]+}/collections', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  return c.json({ collectionIds: stackRepository.getCollectionIdsByStackId(id) });
});

stacksRoute.post('/bulk/tags', async (c) => {
  const parse = BulkTagsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const updated = stackRepository.bulkAddTags(parse.data.stackIds, parse.data.tags);
  return c.json({ success: true, updated });
});

stacksRoute.put('/bulk/author', async (c) => {
  const parse = BulkAuthorSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const updated = stackRepository.bulkSetAuthor(parse.data.stackIds, parse.data.author);
  return c.json({ success: true, updated });
});

stacksRoute.put('/bulk/media-type', async (c) => {
  const parse = BulkMediaTypeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const updated = stackRepository.bulkSetMediaType(parse.data.stackIds, parse.data.mediaType);
  return c.json({ success: true, updated });
});

stacksRoute.put('/bulk/favorite', async (c) => {
  const parse = BulkFavoriteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const updated = stackRepository.bulkSetFavorite(parse.data.stackIds, parse.data.favorited);
  return c.json({ success: true, updated });
});

stacksRoute.post('/bulk/refresh-thumbnails', async (c) => {
  const parse = BulkRefreshThumbsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const updated = await stackRepository.bulkRefreshThumbnails(parse.data.stackIds);
  let previewEligible = 0;
  let previewRegenerated = 0;
  let previewFailures = 0;

  for (const stackId of parse.data.stackIds) {
    try {
      const stack = stackRepository.getById(stackId);
      const dataSetId = Number(stack?.dataSetId ?? stack?.datasetId);
      if (!stack || !Number.isFinite(dataSetId)) {
        previewFailures++;
        continue;
      }
      const result = await stackRepository.regeneratePreviews(stackId, dataSetId, { force: true });
      previewEligible += result?.eligible ?? 0;
      previewRegenerated += result?.regenerated ?? 0;
      previewFailures += result?.failed?.length ?? 0;
    } catch (error) {
      previewFailures++;
      console.error(`Failed to regenerate previews for stack ${stackId}:`, error);
    }
  }

  return c.json({
    success: updated.success && previewFailures === 0,
    updated,
    previews: {
      eligible: previewEligible,
      regenerated: previewRegenerated,
      failures: previewFailures,
    },
  });
});

stacksRoute.post('/merge', async (c) => {
  const parse = MergeStacksSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const stack = stackRepository.mergeStacks(parse.data.targetId, parse.data.sourceIds);
  if (!stack) return c.json({ error: 'Stack not found' }, 404);
  return c.json(stack);
});

stacksRoute.delete('/bulk/remove', async (c) => {
  const parse = BulkRemoveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const deleted = stackRepository.bulkRemoveStacks(parse.data.stackIds);
  return c.json({ success: true, deleted });
});

stacksRoute.delete('/:id{[0-9]+}', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const ok = stackRepository.deleteStack(id);
  if (!ok) return c.json({ error: 'Stack not found' }, 404);
  return c.json({ success: true });
});

stacksRoute.put('/:id{[0-9]+}/author', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const author =
    typeof body === 'object' && body !== null && 'author' in body && typeof body.author === 'string'
      ? body.author
      : '';
  stackRepository.updateAuthor(id, author);
  return c.json({ success: true });
});

stacksRoute.get('/:id{[0-9]+}', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const dataSetIdRaw = c.req.query('dataSetId') || c.req.query('datasetId');
  const dataSetId = dataSetIdRaw ? Number.parseInt(dataSetIdRaw, 10) : undefined;
  const stack = stackRepository.getById(id, dataSetId);
  if (!stack) return c.json({ error: 'Stack not found' }, 404);
  if (dataSetId) {
    const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
    if (auth) return auth;
  }
  return c.json(stack);
});

stacksRoute.post('/', async (c) => {
  try {
    const formData = await c.req.formData();
    const fileEntry = formData.get('file');
    if (!isUploadedFile(fileEntry)) return c.json({ error: 'File is required' }, 400);
    const file = fileEntry;

    const dataSetIdRaw =
      formData.get('dataSetId') || formData.get('datasetId') || formData.get('dataSetID');
    const dataSetId = typeof dataSetIdRaw === 'string' ? Number.parseInt(dataSetIdRaw, 10) : NaN;
    if (Number.isNaN(dataSetId) || dataSetId <= 0) {
      return c.json({ error: 'dataSetId is required' }, 400);
    }

    const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
    if (auth) return auth;

    const collectionRaw = formData.get('collectionId');
    const collectionId =
      typeof collectionRaw === 'string' ? Number.parseInt(collectionRaw, 10) : undefined;
    if (collectionRaw && (!collectionId || collectionId <= 0)) {
      return c.json({ error: 'collectionId must be a positive integer' }, 400);
    }
    if (collectionId) {
      const collection = libraryRepository.getCollection(collectionId);
      if (!collection) return c.json({ error: 'Collection not found' }, 404);
      if (collection.dataSetId !== dataSetId) {
        return c.json({ error: 'Collection does not belong to provided dataset' }, 400);
      }
    }

    const nameValue = formData.get('name');
    const mediaTypeValue = formData.get('mediaType');
    const authorValue = formData.get('author');
    const tags = formData.getAll('tags[]').map((tag) => String(tag));
    let mediaType: MediaCategory;
    if (typeof mediaTypeValue === 'string' && mediaTypeValue.length > 0) {
      const parsedMediaType = MediaCategorySchema.safeParse(mediaTypeValue);
      if (!parsedMediaType.success) {
        return c.json({ error: 'mediaType must be one of image, comic, or video' }, 400);
      }
      mediaType = parsedMediaType.data;
    } else {
      mediaType = inferMediaTypeFromMime(file.type, file.name);
    }

    const storageRoot = process.env.FILES_STORAGE || path.resolve('./data');
    const tmpDir = path.join(storageRoot, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}-${file.name || 'upload'}`);
    fs.writeFileSync(tmpPath, new Uint8Array(await file.arrayBuffer()));

    const stack = await stackRepository.createStackWithFile({
      dataSetId,
      name: typeof nameValue === 'string' && nameValue.length > 0 ? nameValue : file.name,
      mediaType,
      tags: tags.length ? tags : undefined,
      author: typeof authorValue === 'string' ? authorValue : undefined,
      file: {
        path: tmpPath,
        originalname: file.name,
        mimetype: file.type,
        size: file.size,
      },
    });
    if (!stack) return c.json({ error: 'Failed to create stack' }, 500);
    if (collectionId) {
      libraryRepository.addStackToCollection(collectionId, Number(stack.id));
    }
    scheduleStandaloneAutoTagPrediction(stack.assets?.[0] ?? null);
    return c.json(stack, 201);
  } catch (error) {
    if (error instanceof DuplicateAssetError) {
      return c.json({ error: error.message, code: error.code, details: error.details }, 409);
    }
    const pdfErrorMessage = getPdfProcessingErrorMessage(error);
    if (pdfErrorMessage) return c.json({ error: pdfErrorMessage }, 400);
    console.error('Error creating stack with file:', error);
    return c.json({ error: 'Failed to create stack' }, 500);
  }
});

stacksRoute.post('/import-from-urls', async (c) => {
  const parse = ImportFromUrlsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parse.success) {
    return c.json({ error: 'Invalid body', details: parse.error }, 400);
  }

  const { urls, dataSetId, stackId, mediaType, collectionId, author, tags } = parse.data;
  if (!stackId && !dataSetId) {
    return c.json({ error: 'stackId or dataSetId is required' }, 400);
  }

  try {
    let effectiveDatasetId = dataSetId ?? null;

    if (stackId) {
      const stack = stackRepository.getById(stackId);
      if (!stack) return c.json({ error: 'Stack not found' }, 404);
      effectiveDatasetId = stack.dataSetId;
      if (dataSetId && effectiveDatasetId !== dataSetId) {
        return c.json({ error: 'Stack does not belong to provided dataset' }, 400);
      }
    }

    if (!effectiveDatasetId) {
      return c.json({ error: 'dataSetId is required' }, 400);
    }

    const auth = await ensureDatasetAuthorizedForCurrentStore(c, effectiveDatasetId);
    if (auth) return auth;

    if (collectionId) {
      const collection = libraryRepository.getCollection(collectionId);
      if (!collection) return c.json({ error: 'Collection not found' }, 404);
      if (collection.dataSetId !== effectiveDatasetId) {
        return c.json({ error: 'Collection does not belong to provided dataset' }, 400);
      }
    }

    const storageRoot = process.env.FILES_STORAGE || path.resolve('./data');
    const tmpDir = path.join(storageRoot, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const results: Array<{
      url: string;
      status: 'created' | 'added' | 'skipped' | 'error';
      stackId?: number;
      assetId?: number;
      message?: string;
    }> = [];

    for (const url of urls) {
      let downloaded: ImportedFile | null = null;
      try {
        downloaded = await importAssetFromUrl(url, tmpDir);

        if (stackId) {
          const asset = await stackRepository.addAssetWithFile(stackId, downloaded);
          results.push({
            url,
            status: 'added',
            stackId,
            assetId: asset ? Number(asset.id) : undefined,
          });
          scheduleStandaloneAutoTagPrediction(asset);
          continue;
        }

        const createdStack = await stackRepository.createStackWithFile({
          dataSetId: effectiveDatasetId,
          name: downloaded.originalname,
          mediaType:
            mediaType ?? inferMediaTypeFromMime(downloaded.mimetype, downloaded.originalname),
          tags,
          author,
          file: downloaded,
        });
        const createdStackId = Number(createdStack?.id ?? 0);
        const firstAssetId = Number(createdStack?.assets?.[0]?.id ?? 0);

        if (collectionId && createdStackId) {
          libraryRepository.addStackToCollection(collectionId, createdStackId);
        }

        results.push({
          url,
          status: 'created',
          stackId: createdStackId || undefined,
          assetId: firstAssetId || undefined,
        });
        scheduleStandaloneAutoTagPrediction(createdStack?.assets?.[0] ?? null);
      } catch (error) {
        if (downloaded) {
          try {
            fs.rmSync(downloaded.path, { force: true });
          } catch (cleanupError) {
            console.warn('Failed to clean up temp file after URL import error', cleanupError);
          }
        }

        let message = 'URLの取得に失敗しました';
        if (error instanceof DuplicateAssetError) {
          message = error.message;
          results.push({
            url,
            status: 'skipped',
            stackId: error.details?.stackId,
            assetId: error.details?.assetId,
            message,
          });
          continue;
        }

        if (error instanceof Error) {
          message = error.message;
        }

        results.push({ url, status: 'error', message });
      }
    }

    return c.json({ results });
  } catch (error) {
    console.error('Error importing URLs:', error);
    return c.json({ error: 'Failed to import URLs' }, 500);
  }
});
