import { Hono } from 'hono';
import { StandaloneStackRepository } from '../repositories/sqlite/stack-repository';

export const datasetAssetsRoute = new Hono();
const stackRepository = new StandaloneStackRepository();

// GET /datasets/:dataSetId/stacks/:id/assets
datasetAssetsRoute.get('/:dataSetId/stacks/:id/assets', async (c) => {
  const dataSetId = Number.parseInt(c.req.param('dataSetId'), 10);
  const stackId = Number.parseInt(c.req.param('id'), 10);
  return c.json(stackRepository.getAssetsByStackId(stackId, dataSetId));
});

// PUT /datasets/:dataSetId/stacks/:id/assets/:assetId/meta
// Update asset metadata (e.g., video markers)
datasetAssetsRoute.put('/:dataSetId/stacks/:id/assets/:assetId/meta', async (c) => {
  try {
    const dataSetId = Number.parseInt(c.req.param('dataSetId'), 10);
    const assetId = Number.parseInt(c.req.param('assetId'), 10);
    const metaCandidate = await c.req.json().catch(() => ({}));
    const meta =
      typeof metaCandidate === 'object' && metaCandidate !== null && !Array.isArray(metaCandidate)
        ? (metaCandidate as Record<string, unknown>)
        : {};
    const updated = stackRepository.updateAssetMeta(assetId, dataSetId, meta);
    if (!updated) return c.json({ error: 'Asset not found' }, 404);
    return c.json(updated);
  } catch (error) {
    console.error('Error updating asset metadata:', error);
    return c.json({ error: 'Failed to update asset metadata' }, 500);
  }
});
