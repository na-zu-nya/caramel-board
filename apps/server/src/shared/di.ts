// ----------------------------------------------------------------------------
//  @/shared/di.ts
//  “1か所で全部の依存を初期化して、Hono の Context に注入する”ためのヘルパ
//  - createFactory<TEnv, TVars>() を使うと `c.get()` / `c.set()` が型安全に
//  - ランタイムごとに差し替えたいもの（Prisma 接続先など）はここで if分岐
// ----------------------------------------------------------------------------

import { type DataSet, PrismaClient } from '@prisma/client';
import type { Context } from 'hono';
import { createFactory } from 'hono/factory';
import type { createAssetService } from '../features/datasets/services/asset-service';
import type { createColorSearchService } from '../features/datasets/services/color-search-service';
import type { createFileService } from '../features/datasets/services/file-service';
import type { createSearchService } from '../features/datasets/services/search-service';
import type { createStackService } from '../features/datasets/services/stack-service';
import type { createStacksService } from '../features/datasets/services/stacks-service';
import type { createTagService } from '../features/datasets/services/tag-service';
import type { createTagStatsService } from '../features/datasets/services/tag-stats-service';
import { type AutoTagClient, getAutoTagClient } from '../lib/AutoTagClient';
import { createDataStorageService, type DataStorageService } from './services/DataStorageService';

/**
 * Context に載せる “依存” の型を宣言
 * - Env: Cloudflare Workers などの Bindings を含めたい場合に使う
 * - Variables: c.set()/c.get() でやり取りする DI コンテナの中身
 */
type VarKeys = 'prisma' | 'stacksAI' | 'dataStorage';
type AppEnv = object;
declare module 'hono' {
  interface ContextVariableMap {
    prisma: PrismaClient;
    stacksAI: AutoTagClient;
    dataStorage: DataStorageService;
    dataSetId: number;
    dataSet: DataSet;
    stacksService: ReturnType<typeof createStacksService>;
    searchService: ReturnType<typeof createSearchService>;
    fileService: ReturnType<typeof createFileService>;
    colorSearchService: ReturnType<typeof createColorSearchService>;
    tagService: ReturnType<typeof createTagService>;
    stackService: ReturnType<typeof createStackService>;
    assetService: ReturnType<typeof createAssetService>;
    tagStatsService: ReturnType<typeof createTagStatsService>;
  }
}

export const factory = createFactory<AppEnv, VarKeys>();

/**
 *  アプリ全体で 1 度だけ” 初期化して良いものはここで作成
 *  - PrismaClient / AutoTagClient はシングルトンに
 */
export const prisma = new PrismaClient();
const stacksAI = getAutoTagClient();
const dataStorage = createDataStorageService({
  // Prefer generic FILES_STORAGE; keep backward-compat for older envs
  storageDir: process.env.FILES_STORAGE || './data',
});

/**
 * ミドルウェアの作成
 */
export const diMiddleware = factory.createMiddleware(async (c, next) => {
  if (!c.get('prisma')) c.set('prisma', prisma);
  if (!c.get('stacksAI')) c.set('stacksAI', stacksAI);
  if (!c.get('dataStorage')) c.set('dataStorage', dataStorage);
  await next();
});

/**
 * アクセサ関数
 */
export const usePrisma = (c: Context) => c.get('prisma');
export const useStacksAI = (c: Context) => c.get('stacksAI');
export const useDataStorage = (c: Context) => c.get('dataStorage');
