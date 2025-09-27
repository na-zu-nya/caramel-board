import { Hono } from 'hono';
import { createColorSearchService } from '../features/datasets/services/color-search-service';
import { createFileService } from '../features/datasets/services/file-service';
import { getPrisma } from '../lib/Repository.js';
import { useDataStorage } from '../shared/di';
import { AutoTagService } from '../shared/services/AutoTagService';
import { DataSetService } from '../shared/services/DataSetService';
import {
  ensureDatasetAuthorized,
  hashPassword,
  isDatasetAuthorized,
  setDatasetAuthCookie,
  verifyPassword,
} from '../utils/dataset-protection';

// Minimal datasets router to satisfy client needs without heavy deps
const app = new Hono();
const dataSetService = new DataSetService(getPrisma());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as Record<string, unknown>;
  return typeof record.code === 'string' ? record.code : undefined;
};

// List datasets
app.get('/', async (c) => {
  const dataSets = await dataSetService.getAll();
  return c.json(dataSets);
});

// Get dataset by id (optionally include pins via ?includePins=true)
app.get('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const includePins = c.req.query('includePins') === 'true';
  const ds = await dataSetService.getById(id, includePins);
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);
  // Include authorized flag for client gating
  const authorized = await isDatasetAuthorized(c, id);
  return c.json({ ...ds, authorized });
});

// Overview data
app.get('/:id/overview', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const auth = await ensureDatasetAuthorized(c, id);
  if (auth) return auth;
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
  const ds = await dataSetService.getById(id);
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);
  const authorized = await isDatasetAuthorized(c, id);
  return c.json({ isProtected: ds.isProtected, authorized });
});

// Set default dataset
app.post('/:id/set-default', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  try {
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
    const ds = await dataSetService.create({
      name: body.name,
      icon: typeof body.icon === 'string' ? body.icon : undefined,
      themeColor: typeof body.themeColor === 'string' ? body.themeColor : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      settings: isRecord(body.settings) ? body.settings : undefined,
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
    const updated = await dataSetService.update(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      icon: typeof body.icon === 'string' ? body.icon : undefined,
      themeColor: typeof body.themeColor === 'string' ? body.themeColor : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      settings: isRecord(body.settings) ? body.settings : undefined,
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
