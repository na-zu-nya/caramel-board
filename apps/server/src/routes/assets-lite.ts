import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { z } from 'zod';
import { createAssetService } from '../features/datasets/services/asset-service';
import { createColorSearchService } from '../features/datasets/services/color-search-service';
import { createStackService } from '../features/datasets/services/stack-service';
import { isStandaloneSqliteEnabled } from '../repositories/sqlite/sqlite';
import { StandaloneStackRepository } from '../repositories/sqlite/stack-repository';
import { useDataStorage, usePrisma } from '../shared/di';
import { ensureSuperUser } from '../shared/services/UserService';

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
  if (isStandaloneSqliteEnabled()) {
    const ok = new StandaloneStackRepository().deleteAsset(assetId);
    if (!ok) return c.json({ error: 'Asset not found' }, 404);
    return c.json({ success: true });
  }
  const prisma = usePrisma(c);
  const dataSetId = await resolveDatasetIdByAsset(prisma, assetId);
  const assetService = createAssetService({ prisma, dataStorage: useDataStorage(c), dataSetId });
  await assetService.delete(assetId);
  return c.json({ success: true });
});

// POST /assets/:assetId/separate
assetsLiteRoute.post('/:assetId/separate', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  if (Number.isNaN(assetId)) {
    return c.json({ error: 'Invalid asset id' }, 400);
  }
  if (isStandaloneSqliteEnabled()) {
    const stack = new StandaloneStackRepository().separateAsset(assetId);
    if (!stack) return c.json({ error: 'Asset not found' }, 404);
    return c.json({ success: true, stack });
  }

  const prisma = usePrisma(c);
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      stack: {
        select: {
          id: true,
          name: true,
          mediaType: true,
          dataSetId: true,
          authorId: true,
        },
      },
    },
  });

  if (!asset || !asset.stack) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  const { stack } = asset;
  const dataSetId = stack.dataSetId;
  const colorSearch = createColorSearchService({ prisma, dataSetId });
  const stackService = createStackService({ prisma, colorSearch, dataSetId });
  const assetService = createAssetService({ prisma, dataStorage: useDataStorage(c), dataSetId });

  // Derive stack name from asset or fallback to original stack name
  const baseName = asset.originalName?.replace(/\.[^./]+$/, '')?.trim() ?? '';
  const fallbackName = stack.name?.length ? `${stack.name} (Separated)` : 'Separated asset';
  const newStackName = baseName.length ? baseName : fallbackName;

  const createdStack = await stackService.create({
    name: newStackName,
    mediaType: stack.mediaType,
    thumbnail: asset.thumbnail,
  });

  await prisma.stack.update({
    where: { id: createdStack.id },
    data: {
      thumbnail: asset.thumbnail,
      authorId: stack.authorId ?? null,
    },
  });

  await prisma.asset.update({
    where: { id: assetId },
    data: {
      stackId: createdStack.id,
      orderInStack: 0,
    },
  });

  const remainingAssets = await prisma.asset.findMany({
    where: { stackId: stack.id },
    orderBy: { orderInStack: 'asc' },
  });

  let order = 0;
  for (const remaining of remainingAssets) {
    if (remaining.orderInStack !== order) {
      await prisma.asset.update({
        where: { id: remaining.id },
        data: { orderInStack: order },
      });
    }
    order += 1;
  }

  await prisma.stack.update({
    where: { id: stack.id },
    data: {
      thumbnail: remainingAssets[0]?.thumbnail ?? '',
    },
  });

  await assetService.updateOrder(assetId, 0);

  const separatedStack = await stackService.getById(createdStack.id, {
    assets: true,
    tags: true,
    author: true,
  });

  return c.json({ success: true, stack: separatedStack });
});

// PUT /assets/:assetId/order
assetsLiteRoute.put('/:assetId/order', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ order: z.number().int().min(0) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);
  if (isStandaloneSqliteEnabled()) {
    const ok = new StandaloneStackRepository().updateAssetOrder(assetId, parse.data.order);
    if (!ok) return c.json({ error: 'Asset not found' }, 404);
    return c.json({ success: true });
  }
  const prisma = usePrisma(c);
  const dataSetId = await resolveDatasetIdByAsset(prisma, assetId);
  const assetService = createAssetService({ prisma, dataStorage: useDataStorage(c), dataSetId });
  await assetService.updateOrder(assetId, parse.data.order);
  return c.json({ success: true });
});

// PUT /assets/:assetId/favorite
assetsLiteRoute.put('/:assetId/favorite', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  if (Number.isNaN(assetId)) return c.json({ error: 'Invalid asset id' }, 400);

  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ favorited: z.boolean() }).safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid body', details: parse.error }, 400);

  if (isStandaloneSqliteEnabled()) {
    const ok = new StandaloneStackRepository().toggleAssetFavorite(assetId, parse.data.favorited);
    if (!ok) return c.json({ error: 'Asset not found' }, 404);
    return c.json({ success: true, favorited: parse.data.favorited });
  }

  const prisma = usePrisma(c);
  const userId = await ensureSuperUser(prisma);
  const exists = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true },
  });
  if (!exists) return c.json({ error: 'Asset not found' }, 404);

  if (parse.data.favorited) {
    await prisma.assetFavorite.upsert({
      where: {
        userId_assetId: {
          userId,
          assetId,
        },
      },
      update: {},
      create: {
        userId,
        assetId,
      },
    });
  } else {
    await prisma.assetFavorite.deleteMany({
      where: {
        userId,
        assetId,
      },
    });
  }

  return c.json({ success: true, favorited: parse.data.favorited });
});

// POST /assets/:assetId/like
assetsLiteRoute.post('/:assetId/like', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10);
  if (Number.isNaN(assetId)) return c.json({ error: 'Invalid asset id' }, 400);

  if (isStandaloneSqliteEnabled()) {
    const result = new StandaloneStackRepository().likeAsset(assetId);
    if (!result) return c.json({ error: 'Asset not found' }, 404);
    return c.json({
      success: true,
      liked: result.liked,
      stackId: result.stackId,
      assetId: result.assetId,
    });
  }

  const prisma = usePrisma(c);
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      stackId: true,
      stack: {
        select: {
          dataSetId: true,
        },
      },
    },
  });

  if (!asset) return c.json({ error: 'Asset not found' }, 404);

  const colorSearch = createColorSearchService({ prisma, dataSetId: asset.stack.dataSetId });
  const stackService = createStackService({
    prisma,
    colorSearch,
    dataSetId: asset.stack.dataSetId,
  });
  await stackService.like(asset.stackId, asset.id);

  const updated = await prisma.stack.findUnique({
    where: { id: asset.stackId },
    select: { liked: true },
  });

  return c.json({
    success: true,
    liked: updated?.liked ?? 0,
    stackId: asset.stackId,
    assetId: asset.id,
  });
});
