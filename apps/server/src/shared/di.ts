// ----------------------------------------------------------------------------
//  @/shared/di.ts
//  Hono の Context にアプリ共通の依存を注入するためのヘルパ。
// ----------------------------------------------------------------------------

import type { Context } from 'hono';
import { createFactory } from 'hono/factory';
import { type AutoTagClient, getAutoTagClient } from '../lib/AutoTagClient';
import type { StandaloneDataset } from '../repositories/sqlite/dataset-repository';
import { createDataStorageService, type DataStorageService } from './services/DataStorageService';

type VarKeys = 'stacksAI' | 'dataStorage';
type AppEnv = object;

declare module 'hono' {
  interface ContextVariableMap {
    stacksAI: AutoTagClient;
    dataStorage: DataStorageService;
    dataSetId: number;
    dataSet: StandaloneDataset;
  }
}

export const factory = createFactory<AppEnv, VarKeys>();

const stacksAI = getAutoTagClient();
const dataStorage = createDataStorageService({
  storageDir: process.env.FILES_STORAGE || './data',
});

export const diMiddleware = factory.createMiddleware(async (c, next) => {
  if (!c.get('stacksAI')) c.set('stacksAI', stacksAI);
  if (!c.get('dataStorage')) c.set('dataStorage', dataStorage);
  await next();
});

export const useStacksAI = (c: Context) => c.get('stacksAI');
export const useDataStorage = (c: Context) => c.get('dataStorage');
