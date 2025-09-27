import { zValidator } from '@hono/zod-validator';
import type { Prisma, Stack } from '@prisma/client';
import fs from 'node:fs';
import { Hono } from 'hono';
import path from 'node:path';
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
import { DataSetService } from '../shared/services/DataSetService';
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

// Middleware to validate dataset exists
app.use('/:dataSetId/*', async (c, next) => {
  const dataSetId = Number.parseInt(c.req.param('dataSetId'), 10);
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
        };
      });

      return c.json({ stacks, total: result.total, limit: result.limit, offset: result.offset });
    } catch (error) {
      console.error('Error fetching similar stacks:', error);
      return c.json({ error: 'Failed to fetch similar stacks' }, 500);
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
      const stackService = buildStackService(dataSetId);

      let parsed: unknown = {};
      try {
        parsed = await c.req.json();
      } catch {}

      const force =
        typeof (parsed as { force?: boolean }).force === 'boolean'
          ? (parsed as { force?: boolean }).force
          : true;

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
