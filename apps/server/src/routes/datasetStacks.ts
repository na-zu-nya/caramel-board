import fs from 'node:fs';
import path from 'node:path';

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { StandaloneAutoTagRepository } from '../repositories/sqlite/auto-tag-repository';
import { StandaloneColorRepository } from '../repositories/sqlite/color-repository';
import { StandaloneDatasetRepository } from '../repositories/sqlite/dataset-repository';
import { StandaloneLibraryRepository } from '../repositories/sqlite/library-repository';
import { StandaloneMetadataRepository } from '../repositories/sqlite/metadata-repository';
import { StandaloneStackRepository } from '../repositories/sqlite/stack-repository';
import {
  DatasetIdParamSchema,
  IdParamSchema,
  StackQuerySchema,
  UpdateStackSchema,
} from '../schemas/index.js';
import { SearchQuerySchema } from '../schemas/search-schema.js';

const app = new Hono();
const stackRepository = new StandaloneStackRepository();
const datasetRepository = new StandaloneDatasetRepository();
const libraryRepository = new StandaloneLibraryRepository();
const metadataRepository = new StandaloneMetadataRepository();
const colorRepository = new StandaloneColorRepository();
const autoTagRepository = new StandaloneAutoTagRepository();

type MediaType = 'image' | 'comic' | 'video';

const isMediaType = (value: string): value is MediaType =>
  value === 'image' || value === 'comic' || value === 'video';

const toMediaType = (value: string, file: File): MediaType => {
  if (isMediaType(value)) return value;
  const mimeType = (file.type || '').toLowerCase();
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'comic';
  return 'image';
};

const scheduleStandaloneAutoTagPrediction = (asset: { id?: number } | null) => {
  const assetId = Number(asset?.id ?? 0);
  if (!assetId) return;

  void autoTagRepository.predictAssetTags(assetId, 0.4).catch((error) => {
    console.error(`Failed to predict standalone AutoTags for asset ${assetId}:`, error);
  });
};

const getStandaloneColorStackIds = (
  dataSetId: number,
  mediaType: MediaType | undefined,
  colorFilter:
    | {
        hue?: number;
        hex?: string;
        tones?: {
          brightness?: { min?: number; max?: number };
          saturation?: { min?: number; max?: number };
        };
      }
    | undefined
) => {
  if (!colorFilter) return undefined;
  const hasColorFilter =
    typeof colorFilter.hue === 'number' ||
    Boolean(colorFilter.hex) ||
    Boolean(colorFilter.tones?.brightness) ||
    Boolean(colorFilter.tones?.saturation);

  if (!hasColorFilter) return undefined;

  return colorRepository.getMatchingStackIdsByFilter({
    dataSetId,
    mediaType,
    hue: colorFilter.hue,
    hex: colorFilter.hex,
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

app.use('/:dataSetId/*', async (c, next) => {
  const dataSetId = Number.parseInt(c.req.param('dataSetId'), 10);
  const dataSet = datasetRepository.getById(dataSetId);
  if (!dataSet) {
    return c.json({ error: 'DataSet not found' }, 404);
  }

  c.set('dataSet', dataSet);
  c.set('dataSetId', dataSetId);
  await next();
});

app.get(
  '/:dataSetId/stacks',
  zValidator('param', DatasetIdParamSchema),
  zValidator('query', SearchQuerySchema),
  async (c) => {
    try {
      const dataSetId = c.req.valid('param').dataSetId;
      const queryParams = c.req.valid('query');

      if (queryParams.mode === 'similar' && queryParams.referenceStackId) {
        const result = stackRepository.getSimilarByStackIds(
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
      const result = stackRepository.getPaginated({
        dataSetId,
        collection: filters.collectionId,
        mediaType,
        tag: filters.tags?.includeAny ?? filters.tags?.include,
        author: filters.author?.includeAny ?? filters.author?.include,
        fav:
          filters.favorites === 'is-fav' ? '1' : filters.favorites === 'not-fav' ? '0' : undefined,
        liked: filters.likes === 'is-liked' ? '1' : filters.likes === 'not-liked' ? '0' : undefined,
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
        order: sort.order === 'asc' ? 'asc' : 'desc',
        limit: queryParams.limit,
        offset: queryParams.offset,
      });
      return c.json(result);
    } catch (error) {
      console.error('Error searching stacks:', error);
      return c.json({ error: 'Failed to search stacks' }, 500);
    }
  }
);

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
      const result = stackRepository.getSimilarByStackIds(dataSetId, [id], {
        limit,
        offset,
        threshold,
      });
      return c.json(result);
    } catch (error) {
      console.error('Error fetching similar stacks:', error);
      return c.json({ error: 'Failed to fetch similar stacks' }, 500);
    }
  }
);

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
      const result = stackRepository.getSimilarByStackIds(dataSetId, sourceStackIds, {
        limit,
        offset,
        threshold,
      });
      return c.json(result);
    } catch (error) {
      console.error('Error fetching similar stacks for collection:', error);
      return c.json({ error: 'Failed to fetch collection similar stacks' }, 500);
    }
  }
);

app.get(
  '/:dataSetId/stacks/:id',
  zValidator('param', IdParamSchema),
  zValidator('query', StackQuerySchema),
  async (c) => {
    try {
      const dataSetId = c.get('dataSetId') as number;
      const { id } = c.req.valid('param');
      const stack = stackRepository.getById(id, dataSetId);
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
      const parsed = await c.req.json().catch(() => ({}));
      const force =
        typeof parsed === 'object' &&
        parsed !== null &&
        'force' in parsed &&
        typeof parsed.force === 'boolean'
          ? parsed.force
          : true;

      const result = await stackRepository.regeneratePreviews(id, dataSetId, { force });
      if (!result) {
        return c.json({ error: 'Stack not found' }, 404);
      }
      return c.json(result);
    } catch (error) {
      console.error('Error regenerating previews:', error);
      return c.json({ error: 'Failed to regenerate previews' }, 500);
    }
  }
);

app.post('/:dataSetId/stacks', async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const formData = await c.req.formData();
    const file = formData.get('file');
    const mediaTypeValue = formData.get('mediaType');
    const nameValue = formData.get('name');

    if (!(file instanceof File)) {
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

    const storageRoot = process.env.FILES_STORAGE || path.resolve('./data');
    const tempDir = path.join(storageRoot, 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const buffer = await file.arrayBuffer();
    const tempPath = path.join(tempDir, `upload-${Date.now()}-${file.name}`);
    fs.writeFileSync(tempPath, Buffer.from(buffer));

    const mediaType = toMediaType(typeof mediaTypeValue === 'string' ? mediaTypeValue : '', file);
    const name = typeof nameValue === 'string' && nameValue.length > 0 ? nameValue : file.name;
    const stack = await stackRepository.createStackWithFile({
      dataSetId,
      name,
      mediaType,
      file: {
        path: tempPath,
        originalname: file.name,
        mimetype: file.type,
        size: file.size,
      },
    });
    if (!stack) return c.json({ error: 'Failed to create stack' }, 500);
    scheduleStandaloneAutoTagPrediction(stack.assets?.[0] ?? null);
    return c.json(stack, 201);
  } catch (error) {
    console.error('Error creating stack:', error);
    return c.json({ error: 'Failed to create stack' }, 500);
  }
});

app.put(
  '/:dataSetId/stacks/:id',
  zValidator('param', IdParamSchema),
  zValidator('json', UpdateStackSchema),
  async (c) => {
    try {
      const dataSetId = c.get('dataSetId') as number;
      const { id } = c.req.valid('param');
      const data = c.req.valid('json');
      const stack = stackRepository.updateStack(id, dataSetId, data);
      if (!stack) {
        return c.json({ error: 'Stack not found in this dataset' }, 404);
      }
      return c.json(stack);
    } catch (error) {
      console.error('Error updating stack:', error);
      return c.json({ error: 'Failed to update stack' }, 500);
    }
  }
);

app.delete('/:dataSetId/stacks/:id', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    if (!stackRepository.stackBelongsToDataset(id, dataSetId)) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }
    stackRepository.deleteStack(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting stack:', error);
    return c.json({ error: 'Failed to delete stack' }, 500);
  }
});

app.post('/:dataSetId/stacks/:id/tags', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    const body = await c.req.json().catch(() => ({}));
    const tag =
      typeof body === 'object' && body !== null && 'tag' in body && typeof body.tag === 'string'
        ? body.tag
        : '';

    if (!tag) {
      return c.json({ error: 'Tag is required' }, 400);
    }
    if (!stackRepository.stackBelongsToDataset(id, dataSetId)) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }
    stackRepository.addTag(id, tag);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error adding tag:', error);
    return c.json({ error: 'Failed to add tag' }, 500);
  }
});

app.delete('/:dataSetId/stacks/:id/tags/:tag', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    const tag = c.req.param('tag');
    if (!stackRepository.stackBelongsToDataset(id, dataSetId)) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }
    stackRepository.removeTag(id, tag);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing tag:', error);
    return c.json({ error: 'Failed to remove tag' }, 500);
  }
});

app.put('/:dataSetId/stacks/:id/author', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    const body = await c.req.json().catch(() => ({}));
    const author =
      typeof body === 'object' &&
      body !== null &&
      'author' in body &&
      typeof body.author === 'string'
        ? body.author
        : '';

    if (!stackRepository.stackBelongsToDataset(id, dataSetId)) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }
    stackRepository.updateAuthor(id, author);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating author:', error);
    return c.json({ error: 'Failed to update author' }, 500);
  }
});

app.put('/:dataSetId/stacks/:id/favorite', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    const body = await c.req.json().catch(() => ({}));
    const favorited =
      typeof body === 'object' &&
      body !== null &&
      'favorited' in body &&
      typeof body.favorited === 'boolean'
        ? body.favorited
        : false;

    if (!stackRepository.stackBelongsToDataset(id, dataSetId)) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }
    stackRepository.toggleStackFavorite(id, favorited);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error setting favorite:', error);
    return c.json({ error: 'Failed to set favorite' }, 500);
  }
});

app.post('/:dataSetId/stacks/:id/like', zValidator('param', IdParamSchema), async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const { id } = c.req.valid('param');
    if (!stackRepository.stackBelongsToDataset(id, dataSetId)) {
      return c.json({ error: 'Stack not found in this dataset' }, 404);
    }
    stackRepository.likeStack(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error liking stack:', error);
    return c.json({ error: 'Failed to like stack' }, 500);
  }
});

app.get('/:dataSetId/tags/search', async (c) => {
  try {
    const dataSetId = c.get('dataSetId') as number;
    const key = c.req.query('key') || '';
    if (!key) return c.json([]);
    const rows = metadataRepository.searchTags(key, dataSetId);
    return c.json(rows.map((row) => row.title));
  } catch (error) {
    console.error('Error searching tags:', error);
    return c.json({ error: 'Failed to search tags' }, 500);
  }
});

export { app as datasetStacksRoute };
