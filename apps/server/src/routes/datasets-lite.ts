import { Hono } from 'hono';
import {
  ensureDatasetAuthorizedForCurrentStore,
  isDatasetAuthorizedForCurrentStore,
} from '../repositories/sqlite/auth';
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

// データセット内のスタックを、共通のメタ情報リフレッシュ処理で再構築する
app.post('/:id/refresh-all', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const forceRegenerate = c.req.query('forceRegenerate') === 'true';
  try {
    const ds = getStandaloneDatasetRepository().getById(id);
    if (!ds) return c.json({ error: 'DataSet not found' }, 404);
    const auth = await ensureDatasetAuthorizedForCurrentStore(c, id);
    if (auth) return auth;

    const stackRepository = new StandaloneStackRepository();
    const stackIds = stackRepository.getStackIdsByDataset(id);
    let thumbnailEligible = 0;
    let thumbnailRegenerated = 0;
    let thumbnailFailures = 0;
    let previewEligible = 0;
    let previewRegenerated = 0;
    let previewFailures = 0;
    let colorEligible = 0;
    let colorRegenerated = 0;
    let colorFailures = 0;
    let formatRepairs = 0;
    let formatFailures = 0;
    let autotagCandidates = 0;
    let autotagPredictions = 0;
    let autotagFailures = 0;
    let refreshedStacks = 0;

    for (const stackId of stackIds) {
      try {
        const result = await stackRepository.refreshStackMetadata(stackId, {
          force: forceRegenerate,
        });
        if (!result) continue;
        refreshedStacks++;
        thumbnailEligible += result.thumbnails?.eligible ?? 0;
        thumbnailRegenerated += result.thumbnails?.regenerated ?? 0;
        thumbnailFailures += result.thumbnails?.failed.length ?? 0;
        previewEligible += result.previews?.eligible ?? 0;
        previewRegenerated += result.previews?.regenerated ?? 0;
        previewFailures += result.previews?.failed.length ?? 0;
        colorEligible += result.colors.eligible;
        colorRegenerated += result.colors.regenerated;
        colorFailures += result.colors.failed.length;
        formatRepairs += result.formats.repaired;
        formatFailures += result.formats.failed.length;
        autotagCandidates += result.autoTags.candidateAssets;
        autotagPredictions += result.autoTags.predictedAssets;
        autotagFailures += result.autoTags.failedAssets;
      } catch (error) {
        console.error(`Failed to refresh stack ${stackId}:`, error);
      }
    }

    return c.json({
      message: forceRegenerate
        ? '全体リフレッシュ（再生成）を完了しました'
        : '全体リフレッシュを完了しました',
      datasetId: id,
      totalStacks: stackIds.length,
      scheduled: {
        thumbnails: thumbnailRegenerated,
        previews: previewRegenerated,
        colors: colorRegenerated,
        actualMediaTypes: refreshedStacks,
        autotags: refreshedStacks,
        autotagPredictions,
        formatRepairs,
        embeddings: 0,
      },
      totals: {
        thumbnailCandidates: thumbnailEligible,
        thumbnailFailures,
        previewCandidates: previewEligible,
        previewFailures,
        colorCandidates: colorEligible,
        colorFailures,
        formatFailures,
        actualMediaTypeCandidates: refreshedStacks,
        autotagCandidates,
        autotagFailures,
        embeddings: 0,
      },
    });
  } catch (error: unknown) {
    console.error('Failed to run dataset refresh-all:', error);
    return c.json({ error: 'Failed to run dataset refresh-all' }, 500);
  }
});
