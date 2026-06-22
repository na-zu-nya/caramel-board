import type { Context } from 'hono';
import {
  ensureDatasetAuthorized,
  isDatasetAuthorized,
  isDatasetAuthorizedFromState,
} from '../utils/dataset-protection';
import { StandaloneDatasetRepository } from './dataset-repository';
import { isStandaloneSqliteEnabled } from './sqlite';

export const isDatasetAuthorizedForCurrentStore = async (c: Context, id: number) => {
  if (!isStandaloneSqliteEnabled()) return isDatasetAuthorized(c, id);
  const ds = new StandaloneDatasetRepository().getById(id);
  if (!ds) return false;
  return isDatasetAuthorizedFromState(c, id, ds);
};

export const ensureDatasetAuthorizedForCurrentStore = async (c: Context, id: number) => {
  if (!isStandaloneSqliteEnabled()) return ensureDatasetAuthorized(c, id);

  const ok = await isDatasetAuthorizedForCurrentStore(c, id);
  if (!ok) {
    return c.json({ error: 'Protected dataset', protected: true }, 401);
  }
  return null;
};
