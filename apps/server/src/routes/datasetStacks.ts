import fs from 'node:fs';
import path from 'node:path';

import { zValidator } from '@hono/zod-validator';
import { Prisma, type Stack } from '@prisma/client';
import { Hono } from 'hono';
import { z } from 'zod';
import { createColorSearchService } from '../features/datasets/services/color-search-service';
import { createSearchService, SearchMode } from '../features/datasets/services/search-service.js';
import { createStackService } from '../features/datasets/services/stack-service';
import { createTagStatsService } from '../features/datasets/services/tag-stats-service';
import { getPrisma } from '../lib/Repository.js';
import {
  DatasetIdParamSchema,
  IdParamSchema,
  StackQuerySchema,
  UpdateStackSchema,
} from '../schemas/index.js';
import { SearchQuerySchema } from '../schemas/search-schema.js';
import { AutoTagService } from '../shared/services/AutoTagService';
import { CollectionService } from '../shared/services/CollectionService';
import { DataSetService } from '../shared/services/DataSetService';
import { ensureSuperUser } from '../shared/services/UserService';
import { StandaloneColorRepository } from '../standalone/color-repository';
import { StandaloneDatasetRepository } from '../standalone/dataset-repository';
import { StandaloneLibraryRepository } from '../standalone/library-repository';
import { StandaloneMetadataRepository } from '../standalone/metadata-repository';
import { isStandaloneSqliteEnabled } from '../standalone/sqlite';
import { StandaloneStackRepository } from '../standalone/stack-repository';
import { toPublicAssetPath, withPublicAssetArray } from '../utils/assetPath';

const app = new Hono();
const prisma = getPrisma();
const _joytagService = new AutoTagService(prisma);
const dataSetService = new DataSetService(prisma);

type StackWithAssets = Stack & {
  assets?: Array<{ file?: string | null; thumbnail?: string | null }>;
};

function buildStackService(dataSetId: number) {
  const colorSearch = createColorSearchService({ prisma, dataSetId });
  return createStackService({ prisma, colorSearch, dataSetId });
}

const getStandaloneColorStackIds = (
  dataSetId: number,
  mediaType: 'image' | 'comic' | 'video' | undefined,
  colorFilter:
    | {
        hue?: number;
        hex?: string;
        tones?: {
          brightness?: { min?: number; max?: number };
          saturation?: { min?: number; max?: number };
        };
        hueCategories?: string[];
        tonePoint?: { saturation: number; lightness: number };
        toneTolerance?: number;
        similarityThreshold?: number;
        customColor?: string;
      }
    | undefined
) => {
  if (!colorFilter) return undefined;
  const hasColorFilter =
    typeof colorFilter.hue === 'number' ||
    Boolean(colorFilter.hex) ||
    Boolean(colorFilter.tones?.brightness) ||
    Boolean(colorFilter.tones?.saturation) ||
    Boolean(colorFilter.hueCategories?.length) ||
    Boolean(colorFilter.tonePoint) ||
    Boolean(colorFilter.customColor);

  if (!hasColorFilter) return undefined;

  return new StandaloneColorRepository().getMatchingStackIdsByFilter({
    dataSetId,
    mediaType,
    hue: colorFilter.hue,
    hex: colorFilter.hex,
    hueCategories: colorFilter.hueCategories,
    tonePoint: colorFilter.tonePoint,
    toneTolerance: colorFilter.toneTolerance,
    similarityThreshold: colorFilter.similarityThreshold,
    customColor: colorFilter.customColor,
    saturationRange:
      colorFilter.tones?.saturation?.min !== undefined ||
      colorFilter.tones?.saturation?.max !== undefined
        ? {
            min: colorFilter.tones.saturation.min ?? 0,
            max: colorFilter.tones.saturation.max ?? 100,
          }
        : undefined,
    lightnessRange:
      colorFilter.tones?.brightness?.min !== undefined ||
      colorFilter.tones?.brightness?.max !== undefined
        ? {
            min: colorFilter.tones.brightness.min ?? 0,
            max: colorFilter.tones.brightness.max ?? 100,
          }
        : undefined,
  });
};

async function getStackFavoriteSet(stackIds: number[]) {
  if (stackIds.length === 0) {
    return new Set<number>();
  }

  try {
    const userId = await ensureSuperUser(prisma);
    const favorites = await prisma.stackFavorite.findMany({
      where: {
        userId,
        stackId: { in: stackIds },
      },
      select: { stackId: true },
    });
    return new Set(favorites.map((favorite) => favorite.stackId));
  } catch (error) {
    console.error('[datasetStacks] Failed to resolve favorites', error);
    return new Set<number>();
  }
}

// Middleware to validate dataset exists
app.use('/:dataSetId/*', async (c, next) => {
  const dataSetId = Number.parseInt(c.req.param('dataSetId'), 10);
  if (isStandaloneSqliteEnabled()) {
    const dataSet = new StandaloneDatasetRepository().getById(dataSetId);
    if (!dataSet) {
      return c.json({ error: 'DataSet not found' }, 404);
    }

    c.set('dataSet', dataSet);
    c.set('dataSetId', dataSetId);
    await next();
    return;
  }

  const dataSet = await dataSetService.getById(dataSetId);

  if (!dataSet) {
    return c.json({ error: 'DataSet not found' }, 404);
  }

  c.set('dataSet', dataSet);
  c.set('dataSetId', dataSetId);

  // Attach dataset-scoped services required by search endpoints
  try {
    const colorSearchService = createColorSearchService({ prisma, dataSetId });
    const tagStatsService = createTagStatsService({ prisma, dataSetId });
    c.set(
      'searchService',
      createSearchService({
        prisma,
        colorSearch: colorSearchService,
        tagStats: tagStatsService,
        dataSetId,
      })
    );
    c.set('tagStatsService', tagStatsService);
  } catch (e) {
    console.warn('Failed to initialize dataset-scoped searchService:', e);
  }
  await next();
});

// Get all stacks in a dataset with unified search
app.get(
  '/:dataSetId/stacks',
  zValidator('param', DatasetIdParamSchema),
  zValidator('query', SearchQuerySchema),
  async (c) => {
    try {
      const dataSetId = c.req.valid('param').dataSetId;
      const queryParams = c.req.valid('query');

      if (isStandaloneSqliteEnabled()) {
        if (queryParams.mode === SearchMode.SIMILAR && queryParams.referenceStackId) {
          const result = new StandaloneStackRepository().getSimilarByStackIds(
            dataSetId,
            [queryParams.referenceStackId],
            {
              limit: queryParams.limit,
              offset: queryParams.offset,
            }
          );
          return c.json(result);
        }

        const filters = queryParams.filters || {};
        const sort = queryParams.sort || { by: 'recommended', order: 'desc' };
        const mediaType =
          filters.mediaType && filters.mediaType !== 'all' ? filters.mediaType : undefined;
        const stackIds = getStandaloneColorStackIds(dataSetId, mediaType, filters.color);
        const result = new StandaloneStackRepository().getPaginated({
          dataSetId,
          collection: filters.collectionId,
          mediaType,
          tag: filters.tags?.includeAny ?? filters.tags?.include,
          author: filters.author?.includeAny ?? filters.author?.include,
          fav:
            filters.favorites === 'is-fav'
              ? '1'
              : filters.favorites === 'not-fav'
                ? '0'
                : undefined,
          liked:
            filters.likes === 'is-liked' ? '1' : filters.likes === 'not-liked' ? '0' : undefined,
          hasNoTags: filters.tags?.includeNotSet === true,
          hasNoAuthor: filters.author?.includeNotSet === true,
          search: queryParams.query,
          stackIds,
          sort:
            sort.by === 'dateAdded' ||
            sort.by === 'name' ||
            sort.by === 'likes' ||
            sort.by === 'updated'
              ? sort.by
              : 'recommended',
          order: sort.order,
          limit: queryParams.limit,
          offset: queryParams.offset,
        });
        return c.json(result);
      }

      // SearchServiceを取得
      const searchService = c.get('searchService');
      if (!searchService) {
        return c.json({ error: 'Search service not available' }, 500);
      }

      // 検索リクエストを構築
      const searchRequest = {
        mode: queryParams.mode as SearchMode,
        datasetId: dataSetId,
        referenceStackId: queryParams.referenceStackId,
        query: queryParams.query,
        filters: queryParams.filters || {},
        sort: queryParams.sort || { by: 'recommended', order: 'desc' },
        pagination: {
          limit: queryParams.limit,
          offset: queryParams.offset,
        },
      };

      // 検索実行
      const result = await searchService.search(searchRequest);

      const stacks = result.stacks.map((stack) => {
        const stackWithAssets = stack as StackWithAssets;
        const assets = Array.isArray(stackWithAssets.assets)
          ? withPublicAssetArray(stackWithAssets.assets, dataSetId)
          : [];

        return {
          ...stack,
          assets,
          thumbnail: toPublicAssetPath(stack.thumbnail, dataSetId),
        };
      });

      return c.json({
        ...result,
        stacks,
      } satisfies {
        stacks: Stack[];
        total: number;
        limit: number;
        offset: number;
      });
    } catch (error) {
      console.error('Error searching stacks:', error);
      return c.json({ error: 'Failed to search stacks' }, 500);
    }
  }
);

// Similar stacks by embedding (dataset-scoped)
app.get(
  '/:dataSetId/stacks/:id/similar',
  zValidator(
    'param',
    z.object({
      dataSetId: z.coerce.number().int().positive(),
      id: z.coerce.number().int().positive(),
    })
  ),
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
      offset: z.coerce.number().int().min(0).optional().default(0),
      threshold: z.coerce.number().min(0).max(1).optional(),
    })
  ),
  async (c) => {
    try {
      const dataSetId = c.get('dataSetId') as number;
      const { id } = c.req.valid('param');
      const { limit, offset, threshold } = c.req.valid('query');

      if (isStandaloneSqliteEnabled()) {
        const result = new StandaloneStackRepository().getSimilarByStackIds(dataSetId, [id], {
          limit,
          offset,
          threshold,
        });
        return c.json(result);
      }

      const searchService = c.get('searchService');
      if (!searchService) return c.json({ error: 'Search service not available' }, 500);

      const result = await searchService.search({
        mode: SearchMode.SIMILAR,
        datasetId: dataSetId,
        referenceStackId: id,
        similar: threshold === undefined ? undefined : { threshold },
        query: undefined,
        filters: {},
        sort: { by: 'recommended', order: 'desc' },
        pagination: { limit, offset },
      });

      const ids = result.stacks.map((stack) => stack.id);
      let assetCountMap = new Map<number, number>();
      const favoriteSet = await getStackFavoriteSet(ids);
      if (ids.length > 0) {
        const counts = await prisma.asset.groupBy({
          by: ['stackId'],
          where: { stackId: { in: ids } },
          _count: { stackId: true },
        });
        assetCountMap = new Map(counts.map((c) => [c.stackId, c._count.stackId]));
      }

      const stacks = result.stacks.map((stack) => {
        const stackWithAssets = stack as StackWithAssets;
        const assets = Array.isArray(stackWithAssets.assets)
          ? withPublicAssetArray(stackWithAssets.assets, dataSetId)
          : [];

        return {
          ...stack,
          assets,
          thumbnail: toPublicAssetPath(stack.thumbnail, dataSetId),
          assetCount: assetCountMap.get(stack.id) ?? 0,
          assetsCount: assetCountMap.get(stack.id) ?? 0,
          favorited: favoriteSet.has(stack.id),
          isFavorite: favoriteSet.has(stack.id),
        };
      });

      return c.json({ stacks, total: result.total, limit: result.limit, offset: result.offset });
    } catch (error) {
      console.error('Error fetching similar stacks:', error);
      return c.json({ error: 'Failed to fetch similar stacks' }, 500);
    }
  }
);

// コレクション全体のタグ/AutoTag プロファイルから類似スタックを取得
app.get(
  '/:dataSetId/collections/:collectionId/similar',
  zValidator(
    'param',
    z.object({
      dataSetId: z.coerce.number().int().positive(),
      collectionId: z.coerce.number().int().positive(),
    })
  ),
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
      offset: z.coerce.number().int().min(0).optional().default(0),
      threshold: z.coerce.number().min(0).max(1).optional(),
    })
  ),
  async (c) => {
    try {
      const dataSetId = c.get('dataSetId') as number;
      const { collectionId } = c.req.valid('param');
      const { limit, offset, threshold } = c.req.valid('query');

      if (isStandaloneSqliteEnabled()) {
        const libraryRepository = new StandaloneLibraryRepository();
        const collection = libraryRepository.getCollection(collectionId);
        if (!collection || collection.dataSetId !== dataSetId) {
          return c.json({ error: 'Collection not found' }, 404);
        }

        const sourceStackIds =
          collection.type === 'SMART'
            ? (libraryRepository
                .getSmartCollectionStacks(collectionId, 5000, 0)
                ?.stacks.map((stack) => stack.id) ?? [])
            : libraryRepository.getCollectionStackIds(collectionId);
        const result = new StandaloneStackRepository().getSimilarByStackIds(
          dataSetId,
          sourceStackIds,
          {
            limit,
            offset,
            threshold,
          }
        );
        return c.json(result);
      }

      const collection = await prisma.collection.findUnique({
        where: { id: collectionId },
        select: { id: true, dataSetId: true, type: true },
      });

      if (!collection || collection.dataSetId !== dataSetId) {
        return c.json({ error: 'Collection not found' }, 404);
      }

      const searchService = c.get('searchService');
      if (!searchService) return c.json({ error: 'Search service not available' }, 500);

      let sourceStackIds: number[] = [];
      if (collection.type === 'SMART') {
        const collectionService = new CollectionService(prisma);
        const smartStacks = await collectionService.getStacksByFilter(collectionId, 5000, 0);
        sourceStackIds = smartStacks.stacks.map((stack) => stack.id);
      } else {
        const rows = await prisma.collectionStack.findMany({
          where: { collectionId },
          select: { stackId: true },
        });
        sourceStackIds = rows.map((row) => row.stackId);
      }

      const result = await searchService.searchSimilarByStackIds(sourceStackIds, {
        limit,
        offset,
        threshold,
      });

      const ids = result.stacks.map((stack) => stack.id);
      let assetCountMap = new Map<number, number>();
      const favoriteSet = await getStackFavoriteSet(ids);
      if (ids.length > 0) {
        const counts = await prisma.asset.groupBy({
          by: ['stackId'],
          where: { stackId: { in: ids } },
          _count: { stackId: true },
        });
        assetCountMap = new Map(counts.map((count) => [count.stackId, count._count.stackId]));
      }

      const stacks = result.stacks.map((stack) => {
        const stackWithAssets = stack as StackWithAssets;
        const assets = Array.isArray(stackWithAssets.assets)
          ? withPublicAssetArray(stackWithAssets.assets, dataSetId)
          : [];

        return {
          ...stack,
          assets,
          thumbnail: toPublicAssetPath(stack.thumbnail, dataSetId),
          assetCount: assetCountMap.get(stack.id) ?? 0,
          assetsCount: assetCountMap.get(stack.id) ?? 0,
          favorited: favoriteSet.has(stack.id),
          isFavorite: favoriteSet.has(stack.id),
        };
      });

      return c.json({ stacks, total: result.total, limit: result.limit, offset: result.offset });
    } catch (error) {
      console.error('Error fetching similar stacks for collection:', error);
      return c.json({ error: 'Failed to fetch collection similar stacks' }, 500);
    }
  }
);

// Deprecated: paginatedエンドポイントは廃止 - GET /:dataSetId/stacksを使用してください

// Get stack by ID
app.get(
  '/:dataSetId/stacks/:id',
  zValidator('param', IdParamSchema),
  zValidator('query', StackQuerySchema),
  async (c) => {
    try {
      const dataSetId = c.get('dataSetId') as number;
      const { id } = c.req.valid('param');
      const options = c.req.valid('query');

      if (isStandaloneSqliteEnabled()) {
        const stack = new StandaloneStackRepository().getById(id, dataSetId);
        if (!stack) {
          return c.json({ error: 'Stack not found' }, 404);
        }
        return c.json(stack);
      }

      const stackService = buildStackService(dataSetId);
      const stack = await stackService.getById(id, options);

      if (!stack) {
        return c.json({ error: 'Stack not found' }, 404);
      }

      return c.json(stack);
    } catch (error) {
      console.error('Error getting stack:', error);
      return c.json({ error: 'Failed to get stack' }, 500);
    }
  }
);

app.post(
  '/:dataSetId/stacks/:id/regenerate-preview',
  zValidator('param', IdParamSchema),
  async (c) => {
    try {
      const dataSetId = c.get('dataSetId') as number;
      const { id } = c.req.valid('param');

      let parsed: unknown = {};
      try {
        parsed = await c.req.json();
      } catch {}

      const force =
        typeof (parsed as { force?: boolean }).force === 'boolean'
          ? (parsed as { force?: boolean }).force
          : true;

      if (isStandaloneSqliteEnabled()) {
        const result = await new StandaloneStackRepository().regeneratePreviews(id, dataSetId, {
          force,
        });
        if (!result) {
          return c.json({ error: 'Stack not found' }, 404);
        }
        return c.json(result);
      }

      const stackService = buildStackService(dataSetId);
      const result = await stackService.regeneratePreviews(id, { force });
      return c.json(result);
    } catch (error) {
      console.error('Error regenerating previews:', error);
      return c.json({ error: 'Failed to regenerate previews' }, 500);
    }
  }
);

// Create stack with file upload
app.post('/:dataSetId/stacks', async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    // Handle multipart form data for file uploads
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const mediaType = formData.get('mediaType') as string;
    const name = formData.get('name') as string;

    if (!file) {
      return c.json(
        {
          success: false,
          error: {
            issues: [
              {
                code: 'invalid_type',
                expected: 'file',
                received: 'undefined',
                path: ['file'],
                message: 'File is required',
              },
            ],
          },
        },
        400
      );
    }

    // Ensure temp directory exists under storage root
    const storageRoot = process.env.FILES_STORAGE || path.resolve('./data');
    const tempDir = path.join(storageRoot, 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create a temporary file for processing
    const buffer = await file.arrayBuffer();
    const tempPath = path.join(tempDir, `upload-${Date.now()}-${file.name}`);
    fs.writeFileSync(tempPath, Buffer.from(buffer));

    let finalMediaType = typeof mediaType === 'string' && mediaType.length > 0 ? mediaType : '';
    if (!finalMediaType) {
      const mimeType = (file.type || '').toLowerCase();
      if (mimeType.startsWith('video/')) {
        finalMediaType = 'video';
      } else if (mimeType === 'application/pdf') {
        finalMediaType = 'comic';
      } else {
        finalMediaType = 'image';
      }
    }

    if (isStandaloneSqliteEnabled()) {
      const stack = await new StandaloneStackRepository().createStackWithFile({
        dataSetId,
        name: name || file.name,
        mediaType: finalMediaType as 'image' | 'comic' | 'video',
        file: {
          path: tempPath,
          originalname: file.name,
          mimetype: file.type,
          size: file.size,
        },
      });
      if (!stack) return c.json({ error: 'Failed to create stack' }, 500);
      return c.json(stack, 201);
    }

    // Create stack with the file
    const stackService = buildStackService(dataSetId);
    const stack = await stackService.createWithFile({
      name: name || file.name,
      mediaType: finalMediaType,
      file: {
        path: tempPath,
        originalname: file.name,
        mimetype: file.type,
        size: file.size,
      },
    });

    return c.json(stack, 201);
  } catch (error) {
    console.error('Error creating stack:', error);
    return c.json({ error: 'Failed to create stack' }, 500);
  }
});

// Update stack
app.put(
  '/:dataSetId/stacks/:id',
  zValidator('param', IdParamSchema),
  zValidator('json', UpdateStackSchema),
  async (c) => {
    try {
      const dataSetId = c.get('dataSetId') as number;
      const { id } = c.req.valid('param');
      const data = c.req.valid('json');

      if (isStandaloneSqliteEnabled()) {
        const stack = new StandaloneStackRepository().updateStack(id, dataSetId, data);
        if (!stack) {
          return c.json({ error: 'Stack not found in this dataset' }, 404);
        }
        return c.json(stack);
      }

      const stackService = buildStackService(dataSetId);
      const stack = await stackService.update(id, data);
      return c.json(stack);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Stack not found in this dataset') {
        return c.json({ error: error.message }, 404);
      }
      console.error('Error updating stack:', error);
      return c.json({ error: 'Failed to update stack' }, 500);
    }
  }
);

// Delete stack
app.delete('/:dataSetId/stacks/:id', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');

    if (isStandaloneSqliteEnabled()) {
      const repository = new StandaloneStackRepository();
      if (!repository.stackBelongsToDataset(id, dataSetId)) {
        return c.json({ error: 'Stack not found in this dataset' }, 404);
      }
      repository.deleteStack(id);
      return c.json({ success: true });
    }

    const stackService = buildStackService(dataSetId);
    await stackService.deleteStack(id);
    return c.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Stack not found in this dataset') {
      return c.json({ error: error.message }, 404);
    }
    console.error('Error deleting stack:', error);
    return c.json({ error: 'Failed to delete stack' }, 500);
  }
});

// Add tag to stack
app.post('/:dataSetId/stacks/:id/tags', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    const { tag } = await c.req.json();

    if (!tag) {
      return c.json({ error: 'Tag is required' }, 400);
    }

    if (isStandaloneSqliteEnabled()) {
      const repository = new StandaloneStackRepository();
      if (!repository.stackBelongsToDataset(id, dataSetId)) {
        return c.json({ error: 'Stack not found in this dataset' }, 404);
      }
      repository.addTag(id, tag);
      return c.json({ success: true });
    }

    // Verify stack belongs to this dataset
    const stackService = buildStackService(dataSetId);
    const stack = await stackService.getById(id);
    if (!stack) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }

    await stackService.addTag(id, tag);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error adding tag:', error);
    return c.json({ error: 'Failed to add tag' }, 500);
  }
});

// Remove tag from stack
app.delete('/:dataSetId/stacks/:id/tags/:tag', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    const tag = c.req.param('tag');

    if (isStandaloneSqliteEnabled()) {
      const repository = new StandaloneStackRepository();
      if (!repository.stackBelongsToDataset(id, dataSetId)) {
        return c.json({ error: 'Stack not found in this dataset' }, 404);
      }
      repository.removeTag(id, tag);
      return c.json({ success: true });
    }

    // Verify stack belongs to this dataset
    const stackService = buildStackService(dataSetId);
    const stack = await stackService.getById(id);
    if (!stack) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }

    await stackService.removeTag(id, tag);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing tag:', error);
    return c.json({ error: 'Failed to remove tag' }, 500);
  }
});

// Update stack author
app.put('/:dataSetId/stacks/:id/author', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    const { author } = await c.req.json();

    if (isStandaloneSqliteEnabled()) {
      const repository = new StandaloneStackRepository();
      if (!repository.stackBelongsToDataset(id, dataSetId)) {
        return c.json({ error: 'Stack not found in this dataset' }, 404);
      }
      repository.updateAuthor(id, author);
      return c.json({ success: true });
    }

    // Verify stack belongs to this dataset
    const stackService = buildStackService(dataSetId);
    const stack = await stackService.getById(id);
    if (!stack) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }

    await stackService.updateAuthor(id, author);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating author:', error);
    return c.json({ error: 'Failed to update author' }, 500);
  }
});

// Favorite/unfavorite stack
app.put('/:dataSetId/stacks/:id/favorite', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    const { favorited } = await c.req.json();

    if (isStandaloneSqliteEnabled()) {
      const repository = new StandaloneStackRepository();
      if (!repository.stackBelongsToDataset(id, dataSetId)) {
        return c.json({ error: 'Stack not found in this dataset' }, 404);
      }
      repository.toggleStackFavorite(id, Boolean(favorited));
      return c.json({ success: true });
    }

    // Verify stack belongs to this dataset
    const stackService = buildStackService(dataSetId);
    const stack = await stackService.getById(id);
    if (!stack) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }

    await stackService.setFavorite(id, favorited);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error setting favorite:', error);
    return c.json({ error: 'Failed to set favorite' }, 500);
  }
});

// Like stack
app.post('/:dataSetId/stacks/:id/like', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');

    if (isStandaloneSqliteEnabled()) {
      const repository = new StandaloneStackRepository();
      if (!repository.stackBelongsToDataset(id, dataSetId)) {
        return c.json({ error: 'Stack not found in this dataset' }, 404);
      }
      repository.likeStack(id);
      return c.json({ success: true });
    }

    // Verify stack belongs to this dataset
    const stackService = buildStackService(dataSetId);
    const stack = await stackService.getById(id);
    if (!stack) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }

    await stackService.like(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error liking stack:', error);
    return c.json({ error: 'Failed to like stack' }, 500);
  }
});

// Search tags for dataset
app.get('/:dataSetId/tags/search', async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const key = c.req.query('key') || '';
    if (!key) return c.json([]);
    if (isStandaloneSqliteEnabled()) {
      const rows = new StandaloneMetadataRepository().searchTags(key, dataSetId);
      return c.json(rows.map((row) => row.title));
    }
    const rows = await prisma.tag.findMany({
      where: {
        dataSetId,
        title: { contains: key, mode: Prisma.QueryMode.insensitive },
      },
      orderBy: { title: 'asc' },
      take: 10,
      select: { title: true },
    });
    return c.json(rows.map((r) => r.title));
  } catch (error) {
    console.error('Error searching tags:', error);
    return c.json({ error: 'Failed to search tags' }, 500);
  }
});

export { app as datasetStacksRoute };
