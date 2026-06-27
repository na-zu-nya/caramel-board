import type { Context } from 'hono';
import { isDatasetAuthorizedFromState } from '../../utils/dataset-protection';
import { StandaloneDatasetRepository } from './dataset-repository';

export const isDatasetAuthorizedForCurrentStore = async (c: Context, id: number) => {
  const ds = new StandaloneDatasetRepository().getById(id);
  if (!ds) return false;
  return isDatasetAuthorizedFromState(c, id, ds);
};

export const ensureDatasetAuthorizedForCurrentStore = async (c: Context, id: number) => {
  const ok = await isDatasetAuthorizedForCurrentStore(c, id);
  if (!ok) {
    return c.json({ error: 'Protected dataset', protected: true }, 401);
  }
  return null;
};
