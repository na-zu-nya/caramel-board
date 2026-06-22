import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { ensureDatasetAuthorizedForCurrentStore } from '../repositories/sqlite/auth';
import { StandaloneMetadataRepository } from '../repositories/sqlite/metadata-repository';
import { IdParamSchema, ManagementPaginationSchema } from '../schemas/index.js';
import type { AuthorLinkInput } from '../shared/author-links';

export const authorsRoute = new Hono();
const metadataRepository = new StandaloneMetadataRepository();

const AuthorLinkInputSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().max(100).optional().nullable(),
  url: z.string().min(1).max(1000),
});

const AuthorUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  links: z.array(AuthorLinkInputSchema).max(5).optional(),
});

const AuthorMergeSchema = z.object({
  dataSetId: z.coerce.number().int().positive().optional(),
  datasetId: z.coerce.number().int().positive().optional(),
  targetAuthorId: z.coerce.number().int().positive(),
  sourceAuthorIds: z.array(z.coerce.number().int().positive()).min(1),
});

type AuthorLinkInputBody = z.infer<typeof AuthorLinkInputSchema>;
type AuthorUpdateBody = z.infer<typeof AuthorUpdateSchema>;
type AuthorUpdateInput = { name?: string; links?: AuthorLinkInput[] };

const toAuthorLinkInput = (input: AuthorLinkInputBody): AuthorLinkInput | null => {
  if (!input.url) return null;
  return {
    id: input.id,
    label: input.label,
    url: input.url,
  };
};

const toAuthorUpdateInput = (body: AuthorUpdateBody): AuthorUpdateInput | null => {
  const links: AuthorLinkInput[] = [];
  for (const link of body.links ?? []) {
    const normalized = toAuthorLinkInput(link);
    if (!normalized) return null;
    links.push(normalized);
  }

  return {
    name: body.name,
    links: body.links ? links : undefined,
  };
};

function getDataSetId(c: Context): number {
  const ds = c.req.query('datasetId') || c.req.query('dataSetId') || '1';
  const n = Number.parseInt(ds as string, 10);
  return Number.isNaN(n) ? 1 : n;
}

// Get all authors
authorsRoute.get('/', zValidator('query', ManagementPaginationSchema), async (c) => {
  try {
    const { limit, offset } = c.req.valid('query');
    const dataSetId = getDataSetId(c);
    const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
    if (auth) return auth;
    return c.json(metadataRepository.getAuthors({ limit, offset, datasetId: dataSetId }));
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
    const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
    if (auth) return auth;
    return c.json(metadataRepository.searchAuthors(key, dataSetId));
  } catch (error) {
    console.error('Error searching authors:', error);
    return c.json({ error: 'Failed to search authors' }, 500);
  }
});

// Merge authors
authorsRoute.post('/merge', zValidator('json', AuthorMergeSchema), async (c) => {
  try {
    const body = c.req.valid('json');
    const dataSetId = body.dataSetId ?? body.datasetId ?? getDataSetId(c);
    const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
    if (auth) return auth;
    const result = metadataRepository.mergeAuthors(
      dataSetId,
      body.targetAuthorId,
      body.sourceAuthorIds
    );
    if (!result) return c.json({ error: 'Author not found' }, 404);
    return c.json(result);
  } catch (error) {
    console.error('Error merging authors:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to merge authors' },
      500
    );
  }
});

// Get author details
authorsRoute.get('/:id', zValidator('param', IdParamSchema), async (c) => {
  try {
    const { id } = c.req.valid('param');
    const dataSetId = getDataSetId(c);
    const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
    if (auth) return auth;
    const result = metadataRepository.getAuthor(id, dataSetId);
    if (!result) return c.json({ error: 'Author not found' }, 404);
    return c.json(result);
  } catch (error) {
    console.error('Error getting author:', error);
    return c.json({ error: 'Failed to get author' }, 500);
  }
});

// Update author name and links
authorsRoute.put(
  '/:id',
  zValidator('param', IdParamSchema),
  zValidator('json', AuthorUpdateSchema),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const input = toAuthorUpdateInput(body);
      if (!input) return c.json({ error: 'Invalid author link' }, 400);
      const dataSetId = getDataSetId(c);
      const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
      if (auth) return auth;
      const result = metadataRepository.updateAuthor(id, dataSetId, input);
      if (!result) return c.json({ error: 'Author not found' }, 404);
      return c.json(result);
    } catch (error) {
      console.error('Error updating author:', error);
      return c.json(
        { error: error instanceof Error ? error.message : 'Failed to update author' },
        500
      );
    }
  }
);

// Add one author link from the information panel
authorsRoute.post(
  '/:id/links',
  zValidator('param', IdParamSchema),
  zValidator('json', AuthorLinkInputSchema),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const input = toAuthorLinkInput(body);
      if (!input) return c.json({ error: 'Invalid author link' }, 400);
      const dataSetId = getDataSetId(c);
      const auth = await ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
      if (auth) return auth;
      const result = metadataRepository.addAuthorLink(id, dataSetId, input);
      if (!result) return c.json({ error: 'Author not found' }, 404);
      return c.json(result);
    } catch (error) {
      console.error('Error adding author link:', error);
      return c.json(
        { error: error instanceof Error ? error.message : 'Failed to add author link' },
        500
      );
    }
  }
);
