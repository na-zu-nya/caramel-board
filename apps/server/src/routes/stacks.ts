import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Prisma, PrismaClient, Stack } from '@prisma/client';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { DuplicateAssetError } from '../errors/DuplicateAssetError';
import { createAssetService } from '../features/datasets/services/asset-service';
import { createColorSearchService } from '../features/datasets/services/color-search-service';
import {
  type ColorFilter,
  createSearchService,
  type SearchFilters,
  SearchMode,
  type SortOptions,
} from '../features/datasets/services/search-service';
import { createStackService } from '../features/datasets/services/stack-service';
import { createStacksService } from '../features/datasets/services/stacks-service';
import { createTagStatsService } from '../features/datasets/services/tag-stats-service';
import { prisma, useDataStorage, usePrisma } from '../shared/di';
import { AutoTagService } from '../shared/services/AutoTagService';
import { CollectionService } from '../shared/services/CollectionService';
import { ensureSuperUser } from '../shared/services/UserService';
import { toPublicAssetPath, withPublicAssetArray } from '../utils/assetPath';
import { createZipArchive } from '../utils/zip';

type StackAssetSummary = {
  id?: number;
  file?: string | null;
  thumbnail?: string | null;
  preview?: string | null;
  [key: string]: unknown;
};

type SearchStack = Stack & {
  assets?: StackAssetSummary[];
};

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function isUploadedFile(value: unknown): value is UploadedFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<UploadedFile> & { arrayBuffer?: unknown };
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.arrayBuffer === 'function'
  );
}

const PaginatedQuerySchema = z.object({
  dataSetId: z.coerce.number().int().positive(),
  // Basic filters (legacy params from client)
  collection: z.coerce.number().int().positive().optional(),
  mediaType: z.enum(['image', 'comic', 'video']).optional(),
  tag: z.union([z.array(z.string()), z.string()]).optional(),
  author: z.union([z.array(z.string()), z.string()]).optional(),
  fav: z.enum(['0', '1']).optional(),
  liked: z.enum(['0', '1']).optional(),
  hasNoTags: z.coerce.boolean().optional(),
  hasNoAuthor: z.coerce.boolean().optional(),
  // Freeword search (unified search)
  search: z.string().optional(),
  // Color filter params (from client)
  hueCategories: z.union([z.array(z.string()), z.string()]).optional(),
  toneSaturation: z.coerce.number().int().min(0).max(100).optional(),
  toneLightness: z.coerce.number().int().min(0).max(100).optional(),
  toneTolerance: z.coerce.number().int().min(0).max(100).optional(),
  similarityThreshold: z.coerce.number().int().min(0).max(100).optional(),
  customColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  // Sorting / paging
  sort: z
    .enum(['recommended', 'dateAdded', 'name', 'likes', 'updated'])
    .optional()
    .default('recommended'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const ImportFromUrlsSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(20),
  dataSetId: z.number().int().positive().optional(),
  stackId: z.number().int().positive().optional(),
  mediaType: z.enum(['image', 'comic', 'video']).optional(),
  collectionId: z.number().int().positive().optional(),
  author: z.string().min(1).max(200).optional(),
  tags: z.array(z.string().min(1)).optional(),
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

export const stacksRoute = new Hono();

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
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
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

const getUniqueFilename = (filename: string, usedNames: Map<string, number>) => {
  const usedCount = usedNames.get(filename) ?? 0;
  usedNames.set(filename, usedCount + 1);
  if (usedCount === 0) return filename;

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const candidate = `${base} (${usedCount + 1})${ext}`;
  return getUniqueFilename(candidate, usedNames);
};

const resolveStoredFilePath = (
  file: string,
  dataStorage: ReturnType<typeof useDataStorage>
): string | null => {
  const normalized = file.replace(/^\/files\//, '').replace(/^files\//, '');
  const raw = file.startsWith('/') ? file.slice(1) : file;
  const candidates = Array.from(new Set([normalized, raw]));

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

const parseStackIds = (value: string | string[]) => {
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

const parseAssetIds = parseStackIds;

// Helper: build plain object from search params
function getQueryObject(c: Context): Record<string, string | string[]> {
  const sp = new URL(c.req.url).searchParams;
  const obj: Record<string, string | string[]> = {};
  for (const [k, v] of sp.entries()) {
    if (obj[k] === undefined) obj[k] = v;
    else obj[k] = Array.isArray(obj[k]) ? [...obj[k], v] : [obj[k] as string, v];
  }
  return obj;
}

// GET /stacks/download-originals
stacksRoute.get('/download-originals', async (c) => {
  const queryObj = getQueryObject(c);
  const parse = DownloadOriginalsQuerySchema.safeParse(queryObj);
  if (!parse.success) return c.json({ error: 'Invalid query', details: parse.error }, 400);

  const { dataSetId } = parse.data;
  const stackIds = parse.data.stackIds ? parseStackIds(parse.data.stackIds) : [];
  const assetIds = parse.data.assetIds ? parseAssetIds(parse.data.assetIds) : [];
  if (stackIds.length === 0 && assetIds.length === 0) {
    return c.json({ error: 'No stack or asset ids specified' }, 400);
  }

  const auth = await (await import('../utils/dataset-protection')).ensureDatasetAuthorized(
    c,
    dataSetId
  );
  if (auth) return auth;

  const prisma = usePrisma(c);
  const dataStorage = useDataStorage(c);
  const stacks =
    stackIds.length > 0
      ? await prisma.stack.findMany({
          where: { id: { in: stackIds }, dataSetId },
          select: {
            id: true,
            assets: {
              orderBy: { orderInStack: 'asc' },
              select: {
                id: true,
                file: true,
                fileType: true,
                originalName: true,
              },
            },
          },
        })
      : [];
  const selectedAssets =
    assetIds.length > 0
      ? await prisma.asset.findMany({
          where: { id: { in: assetIds }, stack: { dataSetId } },
          select: {
            id: true,
            file: true,
            fileType: true,
            originalName: true,
          },
        })
      : [];
  const assetMap = new Map(selectedAssets.map((asset) => [asset.id, asset]));
  type OriginalAsset = (typeof stacks)[number]['assets'][number] | (typeof selectedAssets)[number];
  const stackMap = new Map(stacks.map((stack) => [stack.id, stack]));
  const orderedAssets: OriginalAsset[] = [];

  for (const assetId of assetIds) {
    const asset = assetMap.get(assetId);
    if (!asset) continue;
    orderedAssets.push(asset);
  }

  for (const stackId of stackIds) {
    const stack = stackMap.get(stackId);
    if (!stack) continue;
    for (const asset of stack.assets) {
      orderedAssets.push(asset);
    }
  }

  if (orderedAssets.length === 0) {
    return c.json({ error: 'Original files not found' }, 404);
  }

  const downloadableAssets: Array<OriginalAsset & { filePath: string }> = [];
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
  const zipEntries = downloadableAssets.map((asset) => {
    const filename = getUniqueFilename(
      getDownloadFilename(asset.originalName, asset.file),
      usedNames
    );
    return {
      name: filename,
      data: fs.readFileSync(asset.filePath),
    };
  });
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

// GET /stacks/paginated
stacksRoute.get('/paginated', async (c) => {
  const queryObj = getQueryObject(c);
  const parse = PaginatedQuerySchema.safeParse(queryObj);
  if (!parse.success) return c.json({ error: 'Invalid query', details: parse.error }, 400);

  const {
    dataSetId,
    collection,
    mediaType,
    tag,
    author,
    fav,
    liked,
    hasNoTags,
    hasNoAuthor,
    search,
    hueCategories,
    toneSaturation,
    toneLightness,
    toneTolerance,
    similarityThreshold,
    customColor,
    sort,
    order,
    limit,
    offset,
  } = parse.data;

  // Enforce dataset protection
  const auth = await (await import('../utils/dataset-protection')).ensureDatasetAuthorized(
    c,
    dataSetId
  );
  if (auth) return auth;

  // Build filters compatible with the feature search service
  const filters: SearchFilters = {};

  if (typeof collection === 'number') filters.collectionId = collection;
  if (mediaType) filters.mediaType = mediaType;

  if (author) {
    const authors = Array.isArray(author) ? author : [author];
    filters.author = { includeAny: authors };
  }

  if (tag) {
    const tags = Array.isArray(tag) ? tag : [tag];
    filters.tags = { includeAny: tags };
  }

  if (fav === '1') filters.favorites = 'is-fav';
  if (fav === '0') filters.favorites = 'not-fav';
  if (liked === '1') filters.likes = 'is-liked';
  if (liked === '0') filters.likes = 'not-liked';
  if (hasNoTags) {
    filters.tags = { ...(filters.tags || {}), includeNotSet: true };
  }
  if (hasNoAuthor) {
    filters.author = { ...(filters.author || {}), includeNotSet: true };
  }

  // Map color filter (new style) to SearchFilters.color
  const color: ColorFilter = {};
  if (typeof hueCategories === 'string') color.hueCategories = [hueCategories];
  else if (Array.isArray(hueCategories)) color.hueCategories = hueCategories;
  if (typeof toneSaturation === 'number' && typeof toneLightness === 'number') {
    color.tonePoint = { saturation: toneSaturation, lightness: toneLightness };
  }
  if (typeof toneTolerance === 'number') color.toneTolerance = toneTolerance;
  if (typeof similarityThreshold === 'number') color.similarityThreshold = similarityThreshold;
  if (customColor) color.customColor = customColor;
  if (
    color.hueCategories ||
    color.tonePoint ||
    color.toneTolerance !== undefined ||
    color.similarityThreshold !== undefined ||
    color.customColor
  ) {
    filters.color = color;
  }

  const sortOptions: SortOptions = {
    by: sort || 'recommended',
    order: order || 'desc',
  };

  // Compose services per dataset
  const prisma = usePrisma(c);
  const colorSearch = createColorSearchService({ prisma, dataSetId });
  const tagStats = createTagStatsService({ prisma, dataSetId });
  const searchService = createSearchService({ prisma, colorSearch, tagStats, dataSetId });

  const result = await searchService.search({
    mode: search && search.trim().length > 0 ? SearchMode.UNIFIED : SearchMode.ALL,
    datasetId: dataSetId,
    query: search && search.trim().length > 0 ? search.trim() : undefined,
    filters,
    sort: sortOptions,
    pagination: { limit, offset },
  });

  // Enrich with asset counts in a single query
  const searchStacks = result.stacks as SearchStack[];
  const ids = searchStacks.map((stack) => stack.id);
  let assetCountMap = new Map<number, number>();
  let favoriteSet = new Set<number>();

  if (ids.length > 0) {
    const counts = await prisma.asset.groupBy({
      by: ['stackId'],
      where: { stackId: { in: ids } },
      _count: { stackId: true },
    });
    assetCountMap = new Map(counts.map((count) => [count.stackId, count._count.stackId]));

    try {
      const userId = await ensureSuperUser(prisma);
      const favorites = await prisma.stackFavorite.findMany({
        where: {
          userId,
          stackId: { in: ids },
        },
        select: { stackId: true },
      });
      favoriteSet = new Set(favorites.map((row) => row.stackId));
    } catch (error) {
      console.error('[stacks/paginated] Failed to resolve favorites', error);
    }
  }

  // Ensure thumbnail paths are under /files, and attach assetCount / favorite flags
  const stacks = searchStacks.map((stack) => {
    const assets = withPublicAssetArray(stack.assets ?? [], stack.dataSetId);
    const thumbnail = toPublicAssetPath(assets[0]?.thumbnail || stack.thumbnail, stack.dataSetId);
    const isFavorite = favoriteSet.has(stack.id);
    const likeCount = typeof stack.liked === 'number' ? stack.liked : Number(stack.liked ?? 0);

    return {
      ...stack,
      assets,
      thumbnail,
      assetCount: assetCountMap.get(stack.id) ?? 0,
      assetsCount: assetCountMap.get(stack.id) ?? 0,
      favorited: isFavorite,
      isFavorite,
      liked: likeCount,
      likeCount,
    };
  });

  return c.json({ stacks, total: result.total, limit: result.limit, offset: result.offset });
});

// GET /stacks/favorites/list
// Favorites ページ専用: 検索/フィルタ用の stack favorite とは分けて、asset favorite も混ぜて返す。
stacksRoute.get('/favorites/list', async (c) => {
  const queryObj = getQueryObject(c);
  const parse = FavoriteListQuerySchema.safeParse(queryObj);
  if (!parse.success) return c.json({ error: 'Invalid query', details: parse.error }, 400);

  const { dataSetId, limit, offset } = parse.data;
  const auth = await (await import('../utils/dataset-protection')).ensureDatasetAuthorized(
    c,
    dataSetId
  );
  if (auth) return auth;

  const prisma = usePrisma(c);
  const userId = await ensureSuperUser(prisma);

  const [stackFavorites, assetFavorites] = await Promise.all([
    prisma.stackFavorite.findMany({
      where: {
        userId,
        stack: { dataSetId },
      },
      include: {
        stack: {
          include: {
            assets: {
              take: 1,
              orderBy: { orderInStack: 'asc' },
            },
            _count: {
              select: { assets: true },
            },
          },
        },
      },
    }),
    prisma.assetFavorite.findMany({
      where: {
        userId,
        asset: {
          stack: { dataSetId },
        },
      },
      include: {
        asset: {
          include: {
            stack: {
              include: {
                _count: {
                  select: { assets: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const stackFavoriteSet = new Set(stackFavorites.map((favorite) => favorite.stackId));
  const combined = [
    ...stackFavorites.map((favorite) => {
      const stack = favorite.stack;
      const leadAsset = stack.assets[0];
      const thumbnail = toPublicAssetPath(leadAsset?.thumbnail || stack.thumbnail, dataSetId);
      const likeCount = typeof stack.liked === 'number' ? stack.liked : Number(stack.liked ?? 0);
      return {
        id: stack.id,
        stackId: stack.id,
        favoriteKind: 'stack' as const,
        favoriteId: favorite.id,
        favoriteCreatedAt: favorite.createdAt,
        name: stack.name,
        mediaType: stack.mediaType,
        thumbnail,
        favorited: true,
        isFavorite: true,
        liked: likeCount,
        likeCount,
        assetCount: stack._count.assets,
        assetsCount: stack._count.assets,
        createdAt: stack.createdAt,
        updatedAt: stack.updateAt,
      };
    }),
    ...assetFavorites.map((favorite) => {
      const asset = favorite.asset;
      const stack = asset.stack;
      const thumbnail = toPublicAssetPath(asset.thumbnail || asset.file, dataSetId);
      const likeCount = typeof stack.liked === 'number' ? stack.liked : Number(stack.liked ?? 0);
      return {
        id: `asset:${asset.id}`,
        stackId: stack.id,
        favoriteKind: 'asset' as const,
        favoriteId: favorite.id,
        favoriteCreatedAt: favorite.createdAt,
        assetId: asset.id,
        favoritePage: asset.orderInStack + 1,
        name: stack.name,
        mediaType: stack.mediaType,
        thumbnail,
        favorited: true,
        isFavorite: true,
        stackFavorited: stackFavoriteSet.has(stack.id),
        liked: likeCount,
        likeCount,
        assetCount: stack._count.assets,
        assetsCount: stack._count.assets,
        createdAt: stack.createdAt,
        updatedAt: stack.updateAt,
      };
    }),
  ].sort((left, right) => right.favoriteCreatedAt.getTime() - left.favoriteCreatedAt.getTime());

  return c.json({
    stacks: combined.slice(offset, offset + limit),
    total: combined.length,
    limit,
    offset,
  });
});

// GET /stacks/search/autotag?autoTag=xxx&dataSetId=1&limit=50&offset=0
// Backward-compatible endpoint to fetch stacks matching AutoTag aggregate keys
// Extended to support common filters (mediaType/fav/liked/author/tag/hasNo*)
const AutoTagSearchQuerySchema = z.object({
  dataSetId: z.coerce.number().int().positive(),
  autoTag: z.union([z.array(z.string()), z.string()]),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  search: z.string().optional(),
  mediaType: z.enum(['image', 'comic', 'video']).optional(),
  author: z.union([z.array(z.string()), z.string()]).optional(),
  tag: z.union([z.array(z.string()), z.string()]).optional(),
  fav: z.enum(['0', '1']).optional(),
  liked: z.enum(['0', '1']).optional(),
  hasNoTags: z.coerce.boolean().optional(),
  hasNoAuthor: z.coerce.boolean().optional(),
});

stacksRoute.get('/search/autotag', async (c) => {
  const queryObj = getQueryObject(c);
  const parsed = AutoTagSearchQuerySchema.safeParse(queryObj);
  if (!parsed.success) {
    return c.json({ error: 'Invalid query', details: parsed.error }, 400);
  }

  const {
    dataSetId,
    autoTag,
    limit,
    offset,
    search,
    mediaType,
    author,
    tag,
    fav,
    liked,
    hasNoTags,
    hasNoAuthor,
  } = parsed.data;
  const auth = await (await import('../utils/dataset-protection')).ensureDatasetAuthorized(
    c,
    dataSetId
  );
  if (auth) return auth;
  const tags = Array.isArray(autoTag) ? autoTag : [autoTag];
  const lowered = tags.map((t) => t.toLowerCase());

  // Use raw SQL for efficient JSONB search on topTags array
  // Match any of the requested AutoTag keys (case-insensitive), with default threshold 0.4
  const whereSql = `s."dataSetId" = $1 AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(agg."topTags"::jsonb) elem
    WHERE lower(elem->>'tag') = ANY($2)
      AND (elem->>'score')::float >= 0.4
  )`;

  try {
    // Total count
    const countRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) ::bigint AS count
       FROM "Stack" s
           JOIN "StackAutoTagAggregate" agg
       ON agg."stackId" = s.id
       WHERE ${whereSql}`,
      dataSetId,
      lowered
    );
    let total = Number(countRows[0]?.count ?? 0);

    if (total === 0) {
      return c.json({ stacks: [], total: 0, limit, offset });
    }

    // Optional: intersect with unified search results for 'search'
    let allowedIds: number[] | null = null;
    if (search?.trim()) {
      const colorSearch = createColorSearchService({ prisma, dataSetId });
      const tagStats = createTagStatsService({ prisma, dataSetId });
      const searchService = createSearchService({ prisma, colorSearch, tagStats, dataSetId });
      const unified = await searchService.search({
        mode: SearchMode.UNIFIED,
        datasetId: dataSetId,
        query: search.trim(),
        filters: {},
        sort: { by: 'recommended', order: 'desc' },
        pagination: { limit: 1000, offset: 0 },
      });
      allowedIds = unified.stacks.map((stack) => stack.id);
      if (allowedIds.length === 0) {
        return c.json({ stacks: [], total: 0, limit, offset });
      }
    }

    // Build base ID set (AutoTag ∩ unified-search?)
    const userId = await ensureSuperUser(prisma);

    const baseIdRows: Array<{ id: number }> = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      allowedIds
        ? `SELECT s.id
           FROM "Stack" s
                    JOIN "StackAutoTagAggregate" agg ON agg."stackId" = s.id
           WHERE ${whereSql}
             AND s.id = ANY ($3::int[])
           ORDER BY s.id DESC`
        : `SELECT s.id
           FROM "Stack" s
                    JOIN "StackAutoTagAggregate" agg ON agg."stackId" = s.id
           WHERE ${whereSql}
           ORDER BY s.id DESC`,
      ...(allowedIds ? [dataSetId, lowered, allowedIds] : [dataSetId, lowered])
    );
    const baseIds = baseIdRows.map((r) => r.id);

    // Apply additional filters via Prisma where, intersecting with baseIds
    const where: Prisma.StackWhereInput = { id: { in: baseIds }, dataSetId };
    if (mediaType) where.mediaType = mediaType;
    if (fav === '1') where.favorites = { some: { userId } };
    if (fav === '0') where.favorites = { none: { userId } };
    if (liked === '1') where.liked = { gt: 0 };
    if (liked === '0') where.liked = 0;
    if (hasNoAuthor) where.authorId = null;
    if (hasNoTags) where.tags = { none: {} };
    if (author) {
      const authors = Array.isArray(author) ? author : [author];
      where.author = { name: { in: authors } };
    }
    if (tag) {
      const tags = Array.isArray(tag) ? tag : [tag];
      where.tags = {
        ...(where.tags ?? {}),
        some: { tag: { title: { in: tags } } },
      };
    }

    // Count with all filters
    total = await prisma.stack.count({ where });

    // Page IDs with all filters applied
    const paged = await prisma.stack.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'desc' },
      take: limit,
      skip: offset,
    });
    const ids = paged.map((r) => r.id);

    // Fetch stacks by IDs preserving order
    const allStacks = await usePrisma(c).stack.findMany({
      where: { id: { in: ids }, dataSetId },
      include: {
        assets: {
          orderBy: { orderInStack: 'asc' },
          select: { id: true, file: true, thumbnail: true, preview: true },
        },
      },
    });
    const stackMap = new Map<number, SearchStack>(
      allStacks.map((stack) => [stack.id, stack as SearchStack])
    );
    const favoriteRows = await prisma.stackFavorite.findMany({
      where: {
        userId,
        stackId: { in: ids },
      },
      select: { stackId: true },
    });
    const favoriteSet = new Set(favoriteRows.map((row) => row.stackId));

    const stacks = ids
      .map((id) => stackMap.get(id))
      .filter((stack): stack is SearchStack => Boolean(stack))
      .map((stack) => ({
        ...stack,
        assets: withPublicAssetArray(stack.assets ?? [], dataSetId),
        thumbnail: toPublicAssetPath(stack.thumbnail, dataSetId),
        favorited: favoriteSet.has(stack.id),
        isFavorite: favoriteSet.has(stack.id),
      }));

    return c.json({ stacks, total, limit, offset });
  } catch (error) {
    console.error('Error searching stacks by AutoTag:', error);
    return c.json({ error: 'Failed to search stacks by AutoTag' }, 500);
  }
});

// POST /stacks/:id/like
stacksRoute.post('/:id{[0-9]+}/like', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const prisma = usePrisma(c);
  const ds = await resolveDatasetId(prisma, id);
  const colorSearch = createColorSearchService({ prisma, dataSetId: ds });
  const stackService = createStackService({ prisma, colorSearch, dataSetId: ds });
  await stackService.like(id);
  const updated = await prisma.stack.findUnique({ where: { id }, select: { liked: true } });
  return c.json({ success: true, liked: updated?.liked ?? 0 });
});

// PUT /stacks/:id/favorite
stacksRoute.put('/:id{[0-9]+}/favorite', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const favorited = Boolean(body?.favorited);
  const prisma = usePrisma(c);
  const ds = await resolveDatasetId(prisma, id);
  const colorSearch = createColorSearchService({ prisma, dataSetId: ds });
  const stackService = createStackService({ prisma, colorSearch, dataSetId: ds });
  await stackService.setFavorite(id, favorited);
  return c.json({ success: true });
});

// POST /stacks/:id/refresh-thumbnail
stacksRoute.post('/:id{[0-9]+}/refresh-thumbnail', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const prisma = usePrisma(c);
  const ds = await resolveDatasetId(prisma, id);
  const colorSearch = createColorSearchService({ prisma, dataSetId: ds });
  const stackService = createStackService({ prisma, colorSearch, dataSetId: ds });
  const result = await stackService.refreshThumbnail(id);
  return c.json(result);
});

// POST /stacks/:id/aggregate-tags
stacksRoute.post('/:id{[0-9]+}/aggregate-tags', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const prisma = usePrisma(c);
  try {
    const body = (await c.req.json().catch(() => null)) as { threshold?: number } | null;
    const threshold = typeof body?.threshold === 'number' ? body.threshold : 0.4;
    const autoTagService = new AutoTagService(prisma);
    const result = await autoTagService.aggregateStackTags(id, threshold);
    return c.json(result);
  } catch (error) {
    console.error('Error aggregating stack tags:', error);
    return c.json({ error: 'Failed to aggregate tags' }, 500);
  }
});

// POST /stacks/:id/tags - add a tag to stack
stacksRoute.post('/:id{[0-9]+}/tags', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const prisma = usePrisma(c);
  try {
    const body = await c.req.json();
    const tag = String(body?.tag || '').trim();
    if (!tag) return c.json({ error: 'Tag is required' }, 400);
    const ds = await resolveDatasetId(prisma, id);
    const stacksService = createStacksService({ prisma });
    const res = await stacksService.addTag(id, ds, tag);
    return c.json(res);
  } catch (error) {
    console.error('Error adding tag:', error);
    return c.json({ error: 'Failed to add tag' }, 500);
  }
});

// DELETE /stacks/:id/tags/:tag - remove a tag from stack
stacksRoute.delete('/:id{[0-9]+}/tags/:tag', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const tag = c.req.param('tag');
  const prisma = usePrisma(c);
  try {
    const ds = await resolveDatasetId(prisma, id);
    const stacksService = createStacksService({ prisma });
    const res = await stacksService.removeTag(id, ds, decodeURIComponent(tag));
    return c.json(res);
  } catch (error) {
    console.error('Error removing tag:', error);
    return c.json({ error: 'Failed to remove tag' }, 500);
  }
});

// POST /stacks/:id/assets - add asset to existing stack
stacksRoute.post('/:id{[0-9]+}/assets', async (c) => {
  try {
    const id = Number.parseInt(c.req.param('id'), 10);
    const formData = await c.req.formData();
    const fileEntry = formData.get('file');
    if (!isUploadedFile(fileEntry)) return c.json({ error: 'File is required' }, 400);
    const file = fileEntry;

    const prisma = usePrisma(c);
    const ds = await resolveDatasetId(prisma, id);
    const assetService = createAssetService({
      prisma,
      dataStorage: useDataStorage(c),
      dataSetId: ds,
    });

    const buf = new Uint8Array(await file.arrayBuffer());
    const storageRoot2 = process.env.FILES_STORAGE || path.resolve('./data');
    const tmpDir = path.join(storageRoot2, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}-${file.name || 'upload'}`);
    fs.writeFileSync(tmpPath, buf);

    const asset = await assetService.createWithFile(id, {
      path: tmpPath,
      originalname: file.name,
      mimetype: file.type,
      size: file.size,
    });

    return c.json(asset, 201);
  } catch (error: unknown) {
    if (error instanceof DuplicateAssetError) {
      const msg =
        error.details?.scope === 'same-stack'
          ? 'このスタックに同一画像が既に存在します'
          : '重複画像のため追加できません';
      return c.json(
        {
          error: msg,
          code: error.code,
          details: error.details,
        },
        409
      );
    }
    console.error('Error adding asset to stack:', error);
    return c.json({ error: 'Failed to add asset' }, 500);
  }
});

// GET /stacks/:id/collections
stacksRoute.get('/:id{[0-9]+}/collections', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const prisma = usePrisma(c);
  const ds = await resolveDatasetId(prisma, id);
  const colorSearch = createColorSearchService({ prisma, dataSetId: ds });
  const stackService = createStackService({ prisma, colorSearch, dataSetId: ds });
  const result = await stackService.getCollectionsByStackId(id);
  return c.json(result);
});

function sanitizeFileNameForStorage(name: string): string {
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
}

function resolveFileNameFromHeaders(urlString: string, contentDisposition: string | null): string {
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
}

function inferMediaTypeFromMime(
  mime: string | null | undefined,
  originalName: string
): 'image' | 'comic' | 'video' {
  if (mime?.startsWith('video/')) {
    return 'video';
  }
  if (mime === 'application/pdf') {
    return 'comic';
  }

  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf') return 'comic';
  if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.mpeg', '.mpg'].includes(ext)) {
    return 'video';
  }
  return 'image';
}

function lookupMimeFromExtension(originalName: string): string | null {
  const ext = path.extname(originalName).toLowerCase();
  if (!ext) return null;
  const mapping: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
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
  };
  return mapping[ext] ?? null;
}

async function downloadRemoteAsset(url: string, tmpDir: string) {
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

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
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
}

function copyLocalAssetFromFileUrl(url: string, tmpDir: string) {
  const targetUrl = new URL(url);
  const sourcePath = fileURLToPath(targetUrl);

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
}

async function importAssetFromUrl(url: string, tmpDir: string) {
  const targetUrl = new URL(url);

  if (targetUrl.protocol === 'file:') {
    return copyLocalAssetFromFileUrl(url, tmpDir);
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    throw new Error('未対応のURLスキームです');
  }

  return downloadRemoteAsset(url, tmpDir);
}

// Helper: resolve datasetId for a stack or for a list of stackIds
function sanitizeStackIds(stackIds: number[] | number) {
  const raw = Array.isArray(stackIds) ? stackIds : [stackIds];
  if (raw.length === 0) {
    throw new Error('Stack IDs required');
  }

  const normalized = raw.map((value) => {
    const num = typeof value === 'string' ? Number(value) : value;
    if (
      typeof num !== 'number' ||
      Number.isNaN(num) ||
      !Number.isFinite(num) ||
      !Number.isInteger(num) ||
      num <= 0
    ) {
      console.error('[bulk-stacks] sanitizeStackIds invalid value', value);
      throw new Error('Invalid stack id');
    }
    return num;
  });

  return normalized;
}

async function resolveDatasetId(
  prisma: Pick<PrismaClient, 'stack'>,
  stackIds: number[] | number
): Promise<number> {
  const ids = sanitizeStackIds(stackIds);
  const rows = await prisma.stack.findMany({
    where: { id: { in: ids } },
    select: { id: true, dataSetId: true },
  });
  if (rows.length === 0) throw new Error('Stack not found');
  const ds = rows[0].dataSetId;
  if (rows.some((r) => r.dataSetId !== ds)) throw new Error('Stacks belong to multiple datasets');
  return ds;
}

// Bulk schemas
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
  mediaType: z.enum(['image', 'comic', 'video']),
});
const BulkFavoriteSchema = z.object({
  stackIds: z.array(z.number().int().positive()),
  favorited: z.boolean(),
});
const BulkRefreshThumbsSchema = z.object({ stackIds: z.array(z.number().int().positive()) });
const BulkRemoveSchema = z.object({ stackIds: z.array(z.number().int().positive()) });
const MergeStacksSchema = z.object({
  targetId: z.number().int().positive(),
  sourceIds: z.array(z.number().int().positive()).min(1),
});

async function withStackServiceForIds(c: Context, ids: number[] | number) {
  const sanitizedIds = sanitizeStackIds(ids);
  const prisma = usePrisma(c);
  const ds = await resolveDatasetId(prisma, sanitizedIds);
  const colorSearch = createColorSearchService({ prisma, dataSetId: ds });
  const stackService = createStackService({ prisma, colorSearch, dataSetId: ds });
  return { prisma, stackService, sanitizedIds, dataSetId: ds };
}

// POST /stacks/bulk/tags
stacksRoute.post('/bulk/tags', async (c) => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const parse = BulkTagsSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const { stackService, sanitizedIds } = await withStackServiceForIds(c, parse.data.stackIds);
  const res = await stackService.bulkAddTags(sanitizedIds, parse.data.tags);
  return c.json(res);
});

// PUT /stacks/bulk/author
stacksRoute.put('/bulk/author', async (c) => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const parse = BulkAuthorSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const { stackService, sanitizedIds } = await withStackServiceForIds(c, parse.data.stackIds);
  const res = await stackService.bulkSetAuthor(sanitizedIds, parse.data.author);
  return c.json(res);
});

// PUT /stacks/bulk/media-type
stacksRoute.put('/bulk/media-type', async (c) => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const parse = BulkMediaTypeSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const { stackService, sanitizedIds } = await withStackServiceForIds(c, parse.data.stackIds);
  const res = await stackService.bulkSetMediaType(sanitizedIds, parse.data.mediaType);
  return c.json(res);
});

// PUT /stacks/bulk/favorite
stacksRoute.put('/bulk/favorite', async (c) => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const parse = BulkFavoriteSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const { stackService, sanitizedIds } = await withStackServiceForIds(c, parse.data.stackIds);
  const res = await stackService.bulkSetFavorite(sanitizedIds, parse.data.favorited);
  return c.json(res);
});

// POST /stacks/bulk/refresh-thumbnails
stacksRoute.post('/bulk/refresh-thumbnails', async (c) => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const parse = BulkRefreshThumbsSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const { stackService, sanitizedIds } = await withStackServiceForIds(c, parse.data.stackIds);
  const res = await stackService.bulkRefreshThumbnails(sanitizedIds);
  return c.json(res);
});

// POST /stacks/merge - merge source stacks into target
stacksRoute.post('/merge', async (c) => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const parse = MergeStacksSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const { targetId, sourceIds } = parse.data;
  const sanitized = sanitizeStackIds([targetId, ...sourceIds]);
  const [sanitizedTarget, ...sanitizedSources] = sanitized;
  const { stackService, prisma } = await withStackServiceForIds(c, sanitized);
  const updated = await stackService.mergeStacks(sanitizedTarget, sanitizedSources);
  const assetCount = await prisma.asset.count({ where: { stackId: sanitizedTarget } });
  return c.json({
    success: true,
    targetId: sanitizedTarget,
    merged: sanitizedSources.length,
    stack: { ...updated, assetCount },
  });
});

// DELETE /stacks/bulk/remove
stacksRoute.delete('/bulk/remove', async (c) => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const parse = BulkRemoveSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const { stackService, sanitizedIds } = await withStackServiceForIds(c, parse.data.stackIds);
  const res = await stackService.bulkRemoveStacks(sanitizedIds);
  return c.json(res);
});

// DELETE /stacks/:id
stacksRoute.delete('/:id{[0-9]+}', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const prisma = usePrisma(c);
  const ds = await resolveDatasetId(prisma, id);
  const colorSearch = createColorSearchService({ prisma, dataSetId: ds });
  const stackService = createStackService({ prisma, colorSearch, dataSetId: ds });
  await stackService.delete(id);
  return c.json({ message: 'Stack deleted successfully' });
});

// PUT /stacks/:id/author - update author name
stacksRoute.put('/:id{[0-9]+}/author', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const prisma = usePrisma(c);
  try {
    const body = (await c.req.json().catch(() => null)) as Partial<{
      author: string;
      name: string;
    }> | null;
    const name = String(body?.author ?? body?.name ?? '').trim();
    if (!name) return c.json({ error: 'Author name is required' }, 400);
    const ds = await resolveDatasetId(prisma, id);
    const stacksService = createStacksService({ prisma });
    const res = await stacksService.updateAuthor(id, ds, name);
    return c.json(res);
  } catch (error) {
    console.error('Error updating author:', error);
    return c.json({ error: 'Failed to update author' }, 500);
  }
});

// GET /stacks/:id
stacksRoute.get('/:id{[0-9]+}', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const dataSetId = Number.parseInt(c.req.query('dataSetId') || '', 10);
  const prisma = usePrisma(c);
  const effectiveDs = Number.isNaN(dataSetId) ? await resolveDatasetId(prisma, id) : dataSetId;
  const auth = await (await import('../utils/dataset-protection')).ensureDatasetAuthorized(
    c,
    effectiveDs
  );
  if (auth) return auth;
  const colorSearch = createColorSearchService({ prisma, dataSetId: effectiveDs });
  const stackService = createStackService({ prisma, colorSearch, dataSetId: effectiveDs });
  const stack = await stackService.getById(id, { assets: true, tags: true, author: true });
  if (!stack) return c.json({ error: 'Stack not found' }, 404);
  const assets = withPublicAssetArray(stack.assets ?? [], effectiveDs);
  const assetRows =
    assets.length > 0
      ? await prisma.asset.findMany({
          where: { stackId: id },
          orderBy: { orderInStack: 'asc' },
          select: { id: true },
        })
      : [];
  let assetFavoriteSet = new Set<number>();
  if (assetRows.length > 0) {
    const userId = await ensureSuperUser(prisma);
    const favorites = await prisma.assetFavorite.findMany({
      where: {
        userId,
        assetId: {
          in: assetRows.map((asset) => asset.id),
        },
      },
      select: { assetId: true },
    });
    assetFavoriteSet = new Set(favorites.map((favorite) => favorite.assetId));
  }
  const sanitized = {
    ...stack,
    assets: assets.map((asset, index) => ({
      ...asset,
      id: assetRows[index]?.id,
      favorited: assetFavoriteSet.has(assetRows[index]?.id ?? -1),
      isFavorite: assetFavoriteSet.has(assetRows[index]?.id ?? -1),
    })),
    thumbnail: toPublicAssetPath(stack.thumbnail, effectiveDs),
  };
  return c.json(sanitized);
});

// POST /stacks - create stack with file upload
stacksRoute.post('/', async (c) => {
  try {
    const formData = await c.req.formData();
    const fileEntry = formData.get('file');
    if (!isUploadedFile(fileEntry)) return c.json({ error: 'File is required' }, 400);
    const file = fileEntry;

    // dataset id (accept multiple keys for robustness)
    const dsRaw = (formData.get('dataSetId') ||
      formData.get('datasetId') ||
      formData.get('dataSetID')) as string | null;
    const dataSetId = dsRaw ? Number.parseInt(dsRaw, 10) : Number.NaN;
    if (Number.isNaN(dataSetId) || dataSetId <= 0)
      return c.json({ error: 'dataSetId is required' }, 400);

    const name = (formData.get('name') as string | null) || file.name || 'untitled';
    const explicitMediaType = (formData.get('mediaType') as string | null) || undefined;
    const author = (formData.get('author') as string | null) || undefined;
    const tags = formData.getAll('tags[]').map((t) => String(t));

    const finalMediaType = (() => {
      if (explicitMediaType && explicitMediaType.length > 0) {
        return explicitMediaType;
      }
      const mimeType = (file.type || '').toLowerCase();
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType === 'application/pdf') return 'comic';
      return 'image';
    })();

    // Prepare temp file
    const buf = new Uint8Array(await file.arrayBuffer());
    const storageRoot = process.env.FILES_STORAGE || path.resolve('./data');
    const tmpDir = path.join(storageRoot, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}-${file.name || 'upload'}`);
    fs.writeFileSync(tmpPath, buf);

    // Compose services
    const prisma = usePrisma(c);
    const colorSearch = createColorSearchService({ prisma, dataSetId });
    const stackService = createStackService({ prisma, colorSearch, dataSetId });

    // Create stack with file
    const stack = await stackService.createWithFile({
      name,
      mediaType: finalMediaType,
      tags: tags.length ? tags : undefined,
      author,
      file: {
        path: tmpPath,
        originalname: file.name,
        mimetype: file.type,
        size: file.size,
      },
    });

    return c.json(stack, 201);
  } catch (error: unknown) {
    if (error instanceof DuplicateAssetError) {
      return c.json(
        {
          error: '重複画像のため作成できません',
          code: error.code,
          details: error.details,
        },
        409
      );
    }
    console.error('Error creating stack with file:', error);
    return c.json({ error: 'Failed to create stack' }, 500);
  }
});

stacksRoute.post('/import-from-urls', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parse = ImportFromUrlsSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Invalid body', details: parse.error }, 400);
  }

  const { urls, dataSetId, stackId, mediaType, collectionId, author, tags } = parse.data;

  if (!stackId && !dataSetId) {
    return c.json({ error: 'stackId or dataSetId is required' }, 400);
  }

  try {
    const prisma = usePrisma(c);
    let effectiveDatasetId = dataSetId ?? null;

    if (stackId) {
      effectiveDatasetId = await resolveDatasetId(prisma, stackId);
      if (dataSetId && effectiveDatasetId !== dataSetId) {
        return c.json({ error: 'Stack does not belong to provided dataset' }, 400);
      }
    }

    if (!effectiveDatasetId) {
      return c.json({ error: 'dataSetId is required' }, 400);
    }

    const { ensureDatasetAuthorized } = await import('../utils/dataset-protection');
    const auth = await ensureDatasetAuthorized(c, effectiveDatasetId);
    if (auth) {
      return auth;
    }

    const colorSearch = createColorSearchService({ prisma, dataSetId: effectiveDatasetId });
    const stackService = createStackService({ prisma, colorSearch, dataSetId: effectiveDatasetId });
    const assetService = createAssetService({
      prisma,
      dataStorage: useDataStorage(c),
      dataSetId: effectiveDatasetId,
    });
    const collectionService = collectionId ? new CollectionService(prisma) : null;

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
      let downloaded: {
        path: string;
        originalname: string;
        mimetype: string;
        size: number;
      } | null = null;
      try {
        downloaded = await importAssetFromUrl(url, tmpDir);

        if (stackId) {
          const asset = await assetService.createWithFile(stackId, downloaded);
          results.push({
            url,
            status: 'added',
            stackId,
            assetId: asset ? Number(asset.id) : undefined,
          });
          continue;
        }

        const createdStack = await stackService.createWithFile({
          name: downloaded.originalname,
          mediaType:
            mediaType ?? inferMediaTypeFromMime(downloaded.mimetype, downloaded.originalname),
          tags,
          author,
          file: downloaded,
        });

        const createdStackRecord = createdStack as SearchStack | null;
        const createdStackId = Number(createdStackRecord?.id ?? 0);
        const firstAssetId = Number(createdStackRecord?.assets?.[0]?.id ?? 0);

        if (collectionService && collectionId && createdStackId) {
          try {
            await collectionService.addStackToCollection(collectionId, createdStackId);
          } catch (collectionError) {
            console.warn('Failed to add imported stack to collection', collectionError);
          }
        }

        results.push({
          url,
          status: 'created',
          stackId: createdStackId || undefined,
          assetId: firstAssetId || undefined,
        });
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
    console.error('Error importing assets from URLs:', error);
    return c.json({ error: 'Failed to import from URLs' }, 500);
  }
});
