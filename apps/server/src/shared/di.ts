// ----------------------------------------------------------------------------
//  @/shared/di.ts
//  “1か所で全部の依存を初期化して、Hono の Context に注入する”ためのヘルパ
//  - createFactory<TEnv, TVars>() を使うと `c.get()` / `c.set()` が型安全に
//  - ランタイムごとに差し替えたいもの（Prisma 接続先など）はここで if分岐
// ----------------------------------------------------------------------------

import { PrismaClient } from '@prisma/client';
import type { Context } from 'hono';
import { createFactory } from 'hono/factory';
// ColorSearchService is now dataset-scoped - removed global import
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
