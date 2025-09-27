import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { PaginationSchema } from '../schemas/index.js';
import { AuthorService } from '../shared/services/AuthorService';

export const authorsRoute = new Hono();
const authorService = new AuthorService();

const ensureAuthorized = async (c: Context, dataSetId: number) => {
  const { ensureDatasetAuthorized } = await import('../utils/dataset-protection');
  return ensureDatasetAuthorized(c, dataSetId);
};

function getDataSetId(c: Context): number {
  const ds = c.req.query('datasetId') || c.req.query('dataSetId') || '1';
  const n = Number.parseInt(ds as string, 10);
  return Number.isNaN(n) ? 1 : n;
}

// Get all authors
authorsRoute.get('/', zValidator('query', PaginationSchema), async (c) => {
  try {
    const { limit, offset } = c.req.valid('query');
    const dataSetId = getDataSetId(c);
    const auth = await ensureAuthorized(c, dataSetId);
    if (auth) return auth;
    const result = await authorService.getAll({ limit, offset, dataSetId });
    return c.json(result);
  } catch (error) {
    console.error('Error getting authors:', error);
    return c.json({ error: 'Failed to get authors' }, 500);
  }
});

// Search authors
authorsRoute.get('/search', async (c) => {
  try {
    const key = c.req.query('key') || '';
    const dataSetId = getDataSetId(c);
    const auth = await ensureAuthorized(c, dataSetId);
    if (auth) return auth;
    const authors = await authorService.search(key, dataSetId);
    return c.json(authors);
  } catch (error) {
    console.error('Error searching authors:', error);
    return c.json({ error: 'Failed to search authors' }, 500);
  }
});
