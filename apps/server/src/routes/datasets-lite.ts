import type { Prisma } from '@prisma/client';
import { Hono } from 'hono';
import { createColorSearchService } from '../features/datasets/services/color-search-service';
import { createFileService } from '../features/datasets/services/file-service';
import { getPrisma } from '../lib/Repository.js';
import {
  ensureDatasetAuthorizedForCurrentStore,
  isDatasetAuthorizedForCurrentStore,
} from '../repositories/sqlite/auth';
import { StandaloneAutoTagRepository } from '../repositories/sqlite/auto-tag-repository';
import { StandaloneColorRepository } from '../repositories/sqlite/color-repository';
import { StandaloneDatasetRepository } from '../repositories/sqlite/dataset-repository';
import { isStandaloneSqliteEnabled } from '../repositories/sqlite/sqlite';
import { StandaloneStackRepository } from '../repositories/sqlite/stack-repository';
import { useDataStorage } from '../shared/di';
import { AutoTagService } from '../shared/services/AutoTagService';
import {
  DataSetService,
  DatasetIsDefaultError,
  DatasetNotFoundError,
} from '../shared/services/DataSetService';
import { hashPassword, setDatasetAuthCookie, verifyPassword } from '../utils/dataset-protection';

// Minimal datasets router to satisfy client needs without heavy deps
const app = new Hono();
const dataSetService = new DataSetService(getPrisma());
const STORAGE_PREFIXES_TO_PRUNE = ['library/', 'files/'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toInputJsonObject = (value: unknown): Prisma.InputJsonObject | undefined =>
  isRecord(value) ? (value as Prisma.InputJsonObject) : undefined;

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code: unknown }).code === 'string';

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as Record<string, unknown>;
  return typeof record.code === 'string' ? record.code : undefined;
};

const getStandaloneDatasetRepository = () => new StandaloneDatasetRepository();

// List datasets
app.get('/', async (c) => {
  if (isStandaloneSqliteEnabled()) {
    return c.json(getStandaloneDatasetRepository().getAll());
  }
  const dataSets = await dataSetService.getAll();
  return c.json(dataSets);
});

// Get dataset by id (optionally include pins via ?includePins=true)
app.get('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const includePins = c.req.query('includePins') === 'true';
  if (isStandaloneSqliteEnabled()) {
    const ds = getStandaloneDatasetRepository().getById(id);
    if (!ds) return c.json({ error: 'DataSet not found' }, 404);
    const authorized = await isDatasetAuthorizedForCurrentStore(c, id);
    return c.json({ ...ds, authorized });
  }
  const ds = await dataSetService.getById(id, includePins);
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);
  // Include authorized flag for client gating
  const authorized = await isDatasetAuthorized(c, id);
  return c.json({ ...ds, authorized });
});

// ライブラリの統計(スタック数・アイテム数)
app.get('/:id/stats', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const auth = await ensureDatasetAuthorizedForCurrentStore(c, id);
  if (auth) return auth;
  if (isStandaloneSqliteEnabled()) {
    return c.json(getStandaloneDatasetRepository().getStats(id));
  }
  const prisma = getPrisma();
  const [stackCount, assetCount] = await Promise.all([
    prisma.stack.count({ where: { dataSetId: id } }),
    prisma.asset.count({ where: { stack: { dataSetId: id } } }),
  ]);
  return c.json({ stackCount, assetCount });
});

// Overview data
app.get('/:id/overview', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const auth = await ensureDatasetAuthorizedForCurrentStore(c, id);
  if (auth) return auth;
  if (isStandaloneSqliteEnabled()) {
    const ds = getStandaloneDatasetRepository().getById(id);
    if (!ds) return c.json({ error: 'DataSet not found' }, 404);
    return c.json(getStandaloneDatasetRepository().getOverview(id));
  }
  const overview = await dataSetService.getOverview(id);
  return c.json(overview);
});

// Authentication: verify password and set session cookie
app.post('/:id/auth', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const data = isRecord(body) ? body : {};
  const password = typeof data.password === 'string' ? data.password : '';
  if (!password) return c.json({ error: 'Password required' }, 400);
  if (isStandaloneSqliteEnabled()) {
    const ds = getStandaloneDatasetRepository().getById(id);
    if (!ds) return c.json({ error: 'DataSet not found' }, 404);
    if (!ds.isProtected || !ds.passwordHash || !ds.passwordSalt) {
      return c.json({ error: 'Dataset is not protected' }, 400);
    }
    const ok = verifyPassword(password, ds.passwordSalt, ds.passwordHash);
    if (!ok) return c.json({ error: 'Invalid password' }, 401);
    setDatasetAuthCookie(c, id, ds.passwordHash);
    return c.json({ success: true });
  }
  const ds = await dataSetService.getById(id);
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);
  if (!ds.isProtected || !ds.passwordHash || !ds.passwordSalt) {
    return c.json({ error: 'Dataset is not protected' }, 400);
  }
  const ok = verifyPassword(password, ds.passwordSalt, ds.passwordHash);
  if (!ok) return c.json({ error: 'Invalid password' }, 401);
  setDatasetAuthCookie(c, id, ds.passwordHash);
  return c.json({ success: true });
});

// Enable/disable protection
app.post('/:id/protection', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const data = isRecord(body) ? body : {};
  const enable = Boolean(data.enable);
  const password = typeof data.password === 'string' ? data.password : '';
  const currentPassword = typeof data.currentPassword === 'string' ? data.currentPassword : '';

  if (isStandaloneSqliteEnabled()) {
    const repository = getStandaloneDatasetRepository();
    const ds = repository.getById(id);
    if (!ds) return c.json({ error: 'DataSet not found' }, 404);

    if (enable) {
      if (!password) return c.json({ error: 'Password required to enable protection' }, 400);
      const { salt, hash } = hashPassword(password);
      repository.setProtection(id, {
        isProtected: true,
        passwordSalt: salt,
        passwordHash: hash,
      });
      setDatasetAuthCookie(c, id, hash);
      return c.json({ success: true, isProtected: true });
    }

    if (!currentPassword)
      return c.json({ error: 'Current password required to disable protection' }, 400);
    if (!ds.passwordHash || !ds.passwordSalt)
      return c.json({ error: 'Dataset was not protected' }, 400);
    const ok = verifyPassword(currentPassword, ds.passwordSalt, ds.passwordHash);
    if (!ok) return c.json({ error: 'Invalid password' }, 401);
    repository.setProtection(id, {
      isProtected: false,
      passwordHash: null,
      passwordSalt: null,
    });
    return c.json({ success: true, isProtected: false });
  }

  const prisma = getPrisma();
  const ds = await prisma.dataSet.findUnique({
    where: { id },
    select: { isProtected: true, passwordHash: true, passwordSalt: true },
  });
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);

  if (enable) {
    if (!password) return c.json({ error: 'Password required to enable protection' }, 400);
    const { salt, hash } = hashPassword(password);
    await prisma.dataSet.update({
      where: { id },
      data: { isProtected: true, passwordSalt: salt, passwordHash: hash },
    });
    // Set session cookie so user stays authorized
    setDatasetAuthCookie(c, id, hash);
    return c.json({ success: true, isProtected: true });
  } else {
    // disabling requires current password
    if (!currentPassword)
      return c.json({ error: 'Current password required to disable protection' }, 400);
    if (!ds.passwordHash || !ds.passwordSalt)
      return c.json({ error: 'Dataset was not protected' }, 400);
    const ok = verifyPassword(currentPassword, ds.passwordSalt, ds.passwordHash);
    if (!ok) return c.json({ error: 'Invalid password' }, 401);
    await prisma.dataSet.update({
      where: { id },
      data: { isProtected: false, passwordHash: null, passwordSalt: null },
    });
    // Clear cookie by setting empty (client will drop it when hash changes anyway)
    return c.json({ success: true, isProtected: false });
  }
});

// Protection status for client gating
app.get('/:id/protection-status', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (isStandaloneSqliteEnabled()) {
    const ds = getStandaloneDatasetRepository().getById(id);
    if (!ds) return c.json({ error: 'DataSet not found' }, 404);
    const authorized = await isDatasetAuthorizedForCurrentStore(c, id);
    return c.json({ isProtected: ds.isProtected, authorized });
  }
  const ds = await dataSetService.getById(id);
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);
  const authorized = await isDatasetAuthorized(c, id);
  return c.json({ isProtected: ds.isProtected, authorized });
});

// Set default dataset
app.post('/:id/set-default', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  try {
    if (isStandaloneSqliteEnabled()) {
      const ok = getStandaloneDatasetRepository().setDefault(id);
      if (!ok) return c.json({ error: 'DataSet not found' }, 404);
      return c.json({ success: true });
    }
    await dataSetService.setDefault(id);
    return c.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to set default dataset';
    return c.json({ error: message }, 500);
  }
});

export { app as datasetsLiteRoute };
// Create dataset (minimal)
app.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!isRecord(body) || typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'Name is required' }, 400);
  }
  try {
    if (isStandaloneSqliteEnabled()) {
      const ds = getStandaloneDatasetRepository().create({
        name: body.name,
        icon: typeof body.icon === 'string' ? body.icon : undefined,
        themeColor: typeof body.themeColor === 'string' ? body.themeColor : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        settings: isRecord(body.settings) ? body.settings : undefined,
      });
      return c.json(ds, 201);
    }
    const ds = await dataSetService.create({
      name: body.name,
      icon: typeof body.icon === 'string' ? body.icon : undefined,
      themeColor: typeof body.themeColor === 'string' ? body.themeColor : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      settings: toInputJsonObject(body.settings),
    });
    return c.json(ds, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create dataset';
    return c.json({ error: message }, 500);
  }
});

// Update dataset
app.put('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  if (!isRecord(body)) {
    return c.json({ error: 'Invalid payload' }, 400);
  }

  try {
    if (isStandaloneSqliteEnabled()) {
      const updated = getStandaloneDatasetRepository().update(id, {
        name: typeof body.name === 'string' ? body.name : undefined,
        icon: typeof body.icon === 'string' ? body.icon : undefined,
        themeColor: typeof body.themeColor === 'string' ? body.themeColor : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        settings: isRecord(body.settings) ? body.settings : undefined,
      });
      if (!updated) return c.json({ error: 'DataSet not found' }, 404);
      return c.json(updated);
    }
    const updated = await dataSetService.update(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      icon: typeof body.icon === 'string' ? body.icon : undefined,
      themeColor: typeof body.themeColor === 'string' ? body.themeColor : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      settings: toInputJsonObject(body.settings),
    });
    return c.json(updated);
  } catch (error: unknown) {
    if (getErrorCode(error) === 'P2025') {
      return c.json({ error: 'DataSet not found' }, 404);
    }
    const message = error instanceof Error ? error.message : 'Failed to update dataset';
    return c.json({ error: message }, 500);
  }
});

// Delete dataset with cascaded relations cleanup
app.delete('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid dataset id' }, 400);
  }

  try {
    if (isStandaloneSqliteEnabled()) {
      const result = getStandaloneDatasetRepository().delete(id);
      if (result === 'not_found') {
        return c.json({ error: 'DataSet not found' }, 404);
      }
      if (result === 'is_default') {
        return c.json({ error: 'Default dataset cannot be deleted' }, 400);
      }
    } else {
      await dataSetService.delete(id);
    }
  } catch (error) {
    if (error instanceof DatasetNotFoundError) {
      return c.json({ error: 'DataSet not found' }, 404);
    }
    if (error instanceof DatasetIsDefaultError) {
      return c.json({ error: 'Default dataset cannot be deleted' }, 400);
    }
    console.error('Failed to delete dataset:', error);
    return c.json({ error: 'Failed to delete dataset' }, 500);
  }

  const dataStorage = useDataStorage(c);
  for (const prefix of STORAGE_PREFIXES_TO_PRUNE) {
    try {
      await dataStorage.rmdir(prefix, id);
    } catch (error) {
      if (isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        continue;
      }
      console.warn(`Failed to remove storage directory for ${prefix}${id}:`, error);
    }
  }

  return c.json({ success: true });
});

// Helper: simple concurrency controller
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  const queue = [...items];
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    runners.push(
      (async function loop() {
        while (queue.length > 0) {
          const item = queue.shift()!;
          try {
            await worker(item);
          } catch (e) {
            console.error('Refresh worker error:', e);
          }
        }
      })()
    );
  }
  await Promise.all(runners);
}

// Full dataset refresh: thumbnails + colors + autotags (embeddings removed)
app.post('/:id/refresh-all', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const forceRegenerate = c.req.query('forceRegenerate') === 'true';
  try {
    if (isStandaloneSqliteEnabled()) {
      const ds = getStandaloneDatasetRepository().getById(id);
      if (!ds) return c.json({ error: 'DataSet not found' }, 404);
      const auth = await ensureDatasetAuthorizedForCurrentStore(c, id);
      if (auth) return auth;

      const stackRepository = new StandaloneStackRepository();
      const colorRepository = new StandaloneColorRepository();
      const autoTagRepository = new StandaloneAutoTagRepository();
      const stackIds = stackRepository.getStackIdsByDataset(id);
      const colorStackIds = colorRepository.getDatasetUpdateCandidateStackIds(id);

      for (const stackId of stackIds) {
        stackRepository.refreshStackThumbnail(stackId);
      }
      for (const stackId of colorStackIds) {
        colorRepository.updateStackColors(stackId);
      }

      const autotagPredictionResult = await autoTagRepository.predictDatasetAssetTags(id, {
        threshold: 0.4,
        forceRegenerate,
      });

      let autotagUpdated = 0;
      for (const stackId of stackIds) {
        try {
          autoTagRepository.aggregateStackTags(stackId, 0.4);
          autotagUpdated++;
        } catch (error) {
          console.error(`Failed to aggregate AutoTags for stack ${stackId}:`, error);
        }
      }

      return c.json({
        message: forceRegenerate
          ? '全体リフレッシュ（再生成）を完了しました'
          : '全体リフレッシュを完了しました',
        datasetId: id,
        totalStacks: stackIds.length,
        scheduled: {
          thumbnails: stackIds.length,
          colors: colorStackIds.length,
          autotags: autotagUpdated,
          autotagPredictions: autotagPredictionResult.predictedAssets,
          embeddings: 0,
        },
        totals: {
          autotagCandidates: autotagPredictionResult.candidateAssets,
          autotagFailures: autotagPredictionResult.failedAssets,
          embeddings: 0,
        },
      });
    }
    const prisma = getPrisma();
    const dataStorage = useDataStorage(c);

    // 1) Thumbnails: schedule background regeneration
    const stacks = await prisma.stack.findMany({
      where: { dataSetId: id },
      select: { id: true },
    });
    const totalStacks = stacks.length;

    const fileService = createFileService({ prisma, dataStorage });
    void (async () => {
      await runWithConcurrency(stacks, 4, async (s) => {
        await fileService.refreshStackThumbnail(s.id, id);
      });
      console.log(`Thumbnail refresh completed for dataset ${id}`);
    })();

    // 2) Colors: queue count via dataset-scoped service (returns count only)
    const colorSearch = createColorSearchService({ prisma, dataSetId: id });
    const colorQueued = await colorSearch.updateDatasetColors(forceRegenerate);

    // 3) AutoTags
    const autoTagService = new AutoTagService(prisma);
    const autotagQueued = await autoTagService.regenerateDatasetAutoTags(id, {
      threshold: 0.4,
      batchSize: 5,
      forceRegenerate,
    });

    return c.json({
      message: forceRegenerate
        ? '全体リフレッシュ（再生成）を開始しました'
        : '全体リフレッシュを開始しました',
      datasetId: id,
      totalStacks,
      scheduled: {
        thumbnails: totalStacks,
        colors: colorQueued,
        autotags: autotagQueued,
        embeddings: 0,
      },
      totals: {
        embeddings: 0,
      },
    });
  } catch (error: unknown) {
    console.error('Failed to run dataset refresh-all:', error);
    return c.json({ error: 'Failed to run dataset refresh-all' }, 500);
  }
});
