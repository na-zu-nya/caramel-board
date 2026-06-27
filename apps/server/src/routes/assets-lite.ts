import { Hono } from 'hono';
import { z } from 'zod';
import { StandaloneStackRepository } from '../repositories/sqlite/stack-repository';

export const assetsLiteRoute = new Hono();
const stackRepository = new StandaloneStackRepository();

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
