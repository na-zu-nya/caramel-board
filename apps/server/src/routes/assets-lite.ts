import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { z } from 'zod';
import { createAssetService } from '../features/datasets/services/asset-service';
import { useDataStorage, usePrisma } from '../shared/di';

export const assetsLiteRoute = new Hono();

// Helper to resolve datasetId from assetId
async function resolveDatasetIdByAsset(prisma: PrismaClient, assetId: number): Promise<number> {
  const row = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { stack: { select: { dataSetId: true } } },
  });

  const dataSetId = row?.stack?.dataSetId;
  if (!dataSetId) {
    throw new Error('Asset not found');
  }

  return dataSetId;
}

// DELETE /assets/:assetId
assetsLiteRoute.delete('/:assetId', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  const prisma = usePrisma(c);
  const dataSetId = await resolveDatasetIdByAsset(prisma, assetId);
  const assetService = createAssetService({ prisma, dataStorage: useDataStorage(c), dataSetId });
  await assetService.delete(assetId);
  return c.json({ success: true });
});

// PUT /assets/:assetId/order
assetsLiteRoute.put('/:assetId/order', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ order: z.number().int().min(0) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  const prisma = usePrisma(c);
  const dataSetId = await resolveDatasetIdByAsset(prisma, assetId);
  const assetService = createAssetService({ prisma, dataStorage: useDataStorage(c), dataSetId });
  await assetService.updateOrder(assetId, parse.data.order);
  return c.json({ success: true });
});
