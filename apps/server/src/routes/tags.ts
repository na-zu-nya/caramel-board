import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { createTagService } from '../features/datasets/services/tag-service';
import {
  CreateTagSchema,
  IdParamSchema,
  ManagementPaginationSchema,
  PaginationSchema,
  TagStackSchema,
} from '../schemas/index.js';
import { usePrisma } from '../shared/di';

export const tagsRoute = new Hono();

const ensureAuthorized = async (c: Context, dataSetId: number) => {
  const { ensureDatasetAuthorized } = await import('../utils/dataset-protection');
  return ensureDatasetAuthorized(c, dataSetId);
};

function getDataSetIdFromQuery(c: Context): number {
  const ds = c.req.query('datasetId') || c.req.query('dataSetId') || '1';
  const n = Number.parseInt(ds as string, 10);
  return Number.isNaN(n) ? 1 : n;
}

function makeService(c: Context, dataSetId: number) {
  const prisma = usePrisma(c);
  return createTagService({ prisma, dataSetId });
}

// Get all tags
tagsRoute.get('/', zValidator('query', PaginationSchema), async (c) => {
  try {
    const { limit, offset } = c.req.valid('query');
    const dataSetId = getDataSetIdFromQuery(c);
    const auth = await ensureAuthorized(c, dataSetId);
    if (auth) return auth;
    const orderBy = (c.req.query('orderBy') || 'title') as string;
    const orderDirection = (c.req.query('orderDirection') || 'asc') as string;

    const service = makeService(c, dataSetId);
    const result = await service.getAll({ limit, offset, orderBy, orderDirection });
    return c.json(result);
  } catch (error) {
    console.error('Error getting tags:', error);
    return c.json({ error: 'Failed to get tags' }, 500);
  }
});

// Get all tags for management (higher limit)
tagsRoute.get('/management', zValidator('query', ManagementPaginationSchema), async (c) => {
  try {
    const { limit, offset, dataSetId } = c.req.valid('query');
    const ds = dataSetId ?? getDataSetIdFromQuery(c);
    const auth = await ensureAuthorized(c, ds);
    if (auth) return auth;
    const service = makeService(c, ds);
    const result = await service.getAll({ limit, offset });
    return c.json(result);
  } catch (error) {
    console.error('Error getting tags for management:', error);
    return c.json({ error: 'Failed to get tags' }, 500);
  }
});

// Search tags
tagsRoute.get('/search', async (c) => {
  try {
    const key = c.req.query('key') || '';
    const dataSetId = getDataSetIdFromQuery(c);
    const auth = await ensureAuthorized(c, dataSetId);
    if (auth) return auth;
    const service = makeService(c, dataSetId);
    // Return objects to align with client expectations: { id, title }
    const tags = await service.search(key);
    const prisma = usePrisma(c);
    const rows = await prisma.tag.findMany({
      where: { dataSetId, title: { in: tags } },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });
    return c.json(rows);
  } catch (error) {
    console.error('Error searching tags:', error);
    return c.json({ error: 'Failed to search tags' }, 500);
  }
});

// Create tag
tagsRoute.post('/', zValidator('json', CreateTagSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const dataSetId = getDataSetIdFromQuery(c);
    const auth = await ensureAuthorized(c, dataSetId);
    if (auth) return auth;
    const service = makeService(c, dataSetId);
    const tag = await service.create({ title: data.title });
    return c.json(tag, 201);
  } catch (error) {
    console.error('Error creating tag:', error);
    return c.json({ error: 'Failed to create tag' }, 500);
  }
});

// Tag a stack
tagsRoute.post('/tag-stack', zValidator('json', TagStackSchema), async (c) => {
  try {
    const { stackId, tagIds } = c.req.valid('json');
    const dataSetId = getDataSetIdFromQuery(c);
    const auth = await ensureAuthorized(c, dataSetId);
    if (auth) return auth;
    const service = makeService(c, dataSetId);
    await service.tagStack(stackId, tagIds);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error tagging stack:', error);
    return c.json({ error: 'Failed to tag stack' }, 500);
  }
});

// Rename tag
tagsRoute.put('/:id/rename', zValidator('param', IdParamSchema), async (c) => {
  try {
    const { id } = c.req.valid('param');
    const { title } = await c.req.json();

    if (!title) {
      return c.json({ error: 'Title is required' }, 400);
    }

    const dataSetId = getDataSetIdFromQuery(c);
    const auth = await ensureAuthorized(c, dataSetId);
    if (auth) return auth;
    const service = makeService(c, dataSetId);
    const tag = await service.rename(id, title);
    return c.json(tag);
  } catch (error) {
    console.error('Error renaming tag:', error);
    return c.json({ error: 'Failed to rename tag' }, 500);
  }
});

// Merge tags
tagsRoute.post('/merge', async (c) => {
  try {
    const { sourceTagIds, targetTagId } = await c.req.json();

    if (!sourceTagIds || !Array.isArray(sourceTagIds) || sourceTagIds.length === 0) {
      return c.json({ error: 'Source tag IDs are required' }, 400);
    }

    if (!targetTagId) {
      return c.json({ error: 'Target tag ID is required' }, 400);
    }

    const dataSetId = getDataSetIdFromQuery(c);
    const auth = await ensureAuthorized(c, dataSetId);
    if (auth) return auth;
    const service = makeService(c, dataSetId);
    const result = await service.merge(sourceTagIds, targetTagId);
    return c.json(result);
  } catch (error) {
    console.error('Error merging tags:', error);
    return c.json({ error: 'Failed to merge tags' }, 500);
  }
});

// Get stacks by tag
tagsRoute.get(
  '/:id/stacks',
  zValidator('param', IdParamSchema),
  zValidator('query', PaginationSchema),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const { limit, offset } = c.req.valid('query');
      const dataSetId = getDataSetIdFromQuery(c);
      const auth = await ensureAuthorized(c, dataSetId);
      if (auth) return auth;
      const service = makeService(c, dataSetId);
      const result = await service.getStacksByTag(id, { limit, offset });
      return c.json(result);
    } catch (error) {
      console.error('Error getting stacks by tag:', error);
      return c.json({ error: 'Failed to get stacks by tag' }, 500);
    }
  }
);

// Delete tag
tagsRoute.delete('/:id', zValidator('param', IdParamSchema), async (c) => {
  try {
    const { id } = c.req.valid('param');
    const dataSetId = getDataSetIdFromQuery(c);
    const auth = await ensureAuthorized(c, dataSetId);
    if (auth) return auth;
    const service = makeService(c, dataSetId);
    await service.delete(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting tag:', error);
    return c.json({ error: 'Failed to delete tag' }, 500);
  }
});
