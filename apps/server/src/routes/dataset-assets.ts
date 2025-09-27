import type { Prisma } from '@prisma/client';
import { Hono } from 'hono';
import { createAssetService } from '../features/datasets/services/asset-service';
import { useDataStorage, usePrisma } from '../shared/di';

export const datasetAssetsRoute = new Hono();

// GET /datasets/:dataSetId/stacks/:id/assets
datasetAssetsRoute.get('/:dataSetId/stacks/:id/assets', async (c) => {
  const dataSetId = Number.parseInt(c.req.param('dataSetId'), 10);
  const stackId = Number.parseInt(c.req.param('id'), 10);
  const prisma = usePrisma(c);
  const assetService = createAssetService({ prisma, dataStorage: useDataStorage(c), dataSetId });
  const assets = await assetService.getByStackId(stackId);
  return c.json(assets);
});

// PUT /datasets/:dataSetId/stacks/:id/assets/:assetId/meta
// Update asset metadata (e.g., video markers)
datasetAssetsRoute.put('/:dataSetId/stacks/:id/assets/:assetId/meta', async (c) => {
  try {
    const dataSetId = Number.parseInt(c.req.param('dataSetId'), 10);
    const assetId = Number.parseInt(c.req.param('assetId'), 10);
    const prisma = usePrisma(c);
    const assetService = createAssetService({ prisma, dataStorage: useDataStorage(c), dataSetId });
    const metaCandidate = await c.req.json().catch(() => ({}));
    const meta = (metaCandidate ?? {}) as Prisma.InputJsonValue;

    const updated = await assetService.updateMeta(assetId, meta);
    return c.json(updated);
  } catch (error) {
    console.error('Error updating asset metadata:', error);
    return c.json({ error: 'Failed to update asset metadata' }, 500);
  }
});
