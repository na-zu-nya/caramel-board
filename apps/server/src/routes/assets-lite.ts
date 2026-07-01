import { Hono } from 'hono';
import { z } from 'zod';
import { StandaloneStackRepository } from '../repositories/sqlite/stack-repository';

export const assetsLiteRoute = new Hono();
const stackRepository = new StandaloneStackRepository();

const BulkAssetIdsSchema = z.object({
  assetIds: z
    .array(z.number().int().positive())
    .min(1)
    .refine((assetIds) => new Set(assetIds).size === assetIds.length, {
      message: 'assetIds must be unique',
    }),
});

// DELETE /assets/bulk/remove
assetsLiteRoute.delete('/bulk/remove', async (c) => {
  const parse = BulkAssetIdsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);

  const result = stackRepository.deleteAssets(parse.data.assetIds);
  if (!result) return c.json({ error: 'Asset not found' }, 404);
  return c.json(result);
});

// POST /assets/bulk/separate
assetsLiteRoute.post('/bulk/separate', async (c) => {
  const parse = BulkAssetIdsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);

  const stacks = stackRepository.separateAssets(parse.data.assetIds);
  if (!stacks) return c.json({ error: 'Asset not found' }, 404);
  return c.json({ success: true, stacks });
});

// POST /assets/bulk/create-stack
assetsLiteRoute.post('/bulk/create-stack', async (c) => {
  const parse = BulkAssetIdsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);

  const stack = stackRepository.createStackFromAssets(parse.data.assetIds);
  if (!stack) return c.json({ error: 'Assets must exist and belong to the same stack' }, 404);
  return c.json({ success: true, stack });
});

// DELETE /assets/:assetId
assetsLiteRoute.delete('/:assetId', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  const ok = stackRepository.deleteAsset(assetId);
  if (!ok) return c.json({ error: 'Asset not found' }, 404);
  return c.json({ success: true });
});

// POST /assets/:assetId/separate
assetsLiteRoute.post('/:assetId/separate', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  if (Number.isNaN(assetId)) {
    return c.json({ error: 'Invalid asset id' }, 400);
  }
  const stack = stackRepository.separateAsset(assetId);
  if (!stack) return c.json({ error: 'Asset not found' }, 404);
  return c.json({ success: true, stack });
});

// PUT /assets/:assetId/order
assetsLiteRoute.put('/:assetId/order', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ order: z.number().int().min(0) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const ok = stackRepository.updateAssetOrder(assetId, parse.data.order);
  if (!ok) return c.json({ error: 'Asset not found' }, 404);
  return c.json({ success: true });
});

// PUT /assets/:assetId/favorite
assetsLiteRoute.put('/:assetId/favorite', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  if (Number.isNaN(assetId)) return c.json({ error: 'Invalid asset id' }, 400);

  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ favorited: z.boolean() }).safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);

  const ok = stackRepository.toggleAssetFavorite(assetId, parse.data.favorited);
  if (!ok) return c.json({ error: 'Asset not found' }, 404);
  return c.json({ success: true, favorited: parse.data.favorited });
});

// POST /assets/:assetId/like
assetsLiteRoute.post('/:assetId/like', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  if (Number.isNaN(assetId)) return c.json({ error: 'Invalid asset id' }, 400);

  const result = stackRepository.likeAsset(assetId);
  if (!result) return c.json({ error: 'Asset not found' }, 404);
  return c.json({
    success: true,
    liked: result.liked,
    stackId: result.stackId,
    assetId: result.assetId,
  });
});
