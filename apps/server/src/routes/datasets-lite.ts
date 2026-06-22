import { Hono } from 'hono';
import {
  ensureDatasetAuthorizedForCurrentStore,
  isDatasetAuthorizedForCurrentStore,
} from '../repositories/sqlite/auth';
import { StandaloneAutoTagRepository } from '../repositories/sqlite/auto-tag-repository';
import { StandaloneColorRepository } from '../repositories/sqlite/color-repository';
import { StandaloneDatasetRepository } from '../repositories/sqlite/dataset-repository';
import { StandaloneStackRepository } from '../repositories/sqlite/stack-repository';
import { useDataStorage } from '../shared/di';
import { hashPassword, setDatasetAuthCookie, verifyPassword } from '../utils/dataset-protection';

// Minimal datasets router to satisfy client needs without heavy deps
const app = new Hono();
const STORAGE_PREFIXES_TO_PRUNE = ['library/', 'files/'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code: unknown }).code === 'string';

const getStandaloneDatasetRepository = () => new StandaloneDatasetRepository();

// List datasets
app.get('/', async (c) => {
  return c.json(getStandaloneDatasetRepository().getAll());
});

// Get dataset by id (optionally include pins via ?includePins=true)
app.get('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const _includePins = c.req.query('includePins') === 'true';
  const ds = getStandaloneDatasetRepository().getById(id);
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);
  const authorized = await isDatasetAuthorizedForCurrentStore(c, id);
  return c.json({ ...ds, authorized });
});

// ライブラリの統計(スタック数・アイテム数)
app.get('/:id/stats', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const auth = await ensureDatasetAuthorizedForCurrentStore(c, id);
  if (auth) return auth;
  return c.json(getStandaloneDatasetRepository().getStats(id));
});

// Overview data
app.get('/:id/overview', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const auth = await ensureDatasetAuthorizedForCurrentStore(c, id);
  if (auth) return auth;
  const ds = getStandaloneDatasetRepository().getById(id);
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);
  return c.json(getStandaloneDatasetRepository().getOverview(id));
});

// Authentication: verify password and set session cookie
app.post('/:id/auth', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const data = isRecord(body) ? body : {};
  const password = typeof data.password === 'string' ? data.password : '';
  if (!password) return c.json({ error: 'Password required' }, 400);
  const ds = getStandaloneDatasetRepository().getById(id);
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
});

// Protection status for client gating
app.get('/:id/protection-status', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const ds = getStandaloneDatasetRepository().getById(id);
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);
  const authorized = await isDatasetAuthorizedForCurrentStore(c, id);
  return c.json({ isProtected: ds.isProtected, authorized });
});

// Set default dataset
app.post('/:id/set-default', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  try {
    const ok = getStandaloneDatasetRepository().setDefault(id);
    if (!ok) return c.json({ error: 'DataSet not found' }, 404);
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
    const ds = getStandaloneDatasetRepository().create({
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
    const updated = getStandaloneDatasetRepository().update(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      icon: typeof body.icon === 'string' ? body.icon : undefined,
      themeColor: typeof body.themeColor === 'string' ? body.themeColor : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      settings: isRecord(body.settings) ? body.settings : undefined,
    });
    if (!updated) return c.json({ error: 'DataSet not found' }, 404);
    return c.json(updated);
  } catch (error: unknown) {
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
    const result = getStandaloneDatasetRepository().delete(id);
    if (result === 'not_found') {
      return c.json({ error: 'DataSet not found' }, 404);
    }
    if (result === 'is_default') {
      return c.json({ error: 'Default dataset cannot be deleted' }, 400);
    }
  } catch (error) {
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

// Full dataset refresh: thumbnails + colors + autotags (embeddings removed)
app.post('/:id/refresh-all', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const forceRegenerate = c.req.query('forceRegenerate') === 'true';
  try {
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
  } catch (error: unknown) {
    console.error('Failed to run dataset refresh-all:', error);
    return c.json({ error: 'Failed to run dataset refresh-all' }, 500);
  }
});
