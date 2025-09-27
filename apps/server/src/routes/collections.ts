import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { getPrisma } from '../lib/Repository.js';
import {
  CollectionQuerySchema,
  CreateCollectionSchema,
  UpdateCollectionSchema,
} from '../models/CollectionModel.js';
import { CollectionService } from '../shared/services/CollectionService';
import { useResponse } from '../utils/useResponse.js';

const app = new Hono();
const collectionService = new CollectionService(getPrisma());

// コレクション一覧取得
app.get('/', zValidator('query', CollectionQuerySchema), async (c) => {
  try {
    const query = c.req.valid('query');
    const { ensureDatasetAuthorized } = await import('../utils/dataset-protection');
    if (query.dataSetId) {
      const auth = await ensureDatasetAuthorized(c as any, query.dataSetId);
      if (auth) return useResponse(c, auth as any);
    } else if (query.folderId !== undefined) {
      // Resolve dataset from folder
      const folder = await collectionService.findFolderById?.(query.folderId as number);
      if (folder?.dataSetId) {
        const auth = await ensureDatasetAuthorized(c as any, folder.dataSetId);
        if (auth) return useResponse(c, auth as any);
      }
    }
    const result = await collectionService.findAll(query);
    return useResponse(c, result);
  } catch (error) {
    console.error('コレクション一覧取得エラー:', error);
    return useResponse(c, { error: 'コレクション一覧の取得に失敗しました' }, 500);
  }
});

// コレクション詳細取得
app.get('/:id', zValidator('param', z.object({ id: z.coerce.number() })), async (c) => {
  try {
    const { id } = c.req.valid('param');
    const collection = await collectionService.findById(id);

    if (!collection) {
      return useResponse(c, { error: 'コレクションが見つかりません' }, 404);
    }

    const { ensureDatasetAuthorized } = await import('../utils/dataset-protection');
    const auth = await ensureDatasetAuthorized(c as any, collection.dataSetId);
    if (auth) return useResponse(c, auth as any);

    return useResponse(c, collection);
  } catch (error) {
    console.error('コレクション詳細取得エラー:', error);
    return useResponse(c, { error: 'コレクション詳細の取得に失敗しました' }, 500);
  }
});

// コレクション作成
app.post('/', zValidator('json', CreateCollectionSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const collection = await collectionService.create(data);
    return useResponse(c, collection, 201);
  } catch (error) {
    console.error('コレクション作成エラー:', error);
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return useResponse(
          c,
          { error: 'このデータセットには既に同じ名前のコレクションが存在します' },
          400
        );
      }
    }
    return useResponse(c, { error: 'コレクションの作成に失敗しました' }, 500);
  }
});

// コレクション更新
app.put(
  '/:id',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator('json', UpdateCollectionSchema),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const data = c.req.valid('json');
      const collection = await collectionService.update(id, data);
      return useResponse(c, collection);
    } catch (error) {
      console.error('コレクション更新エラー:', error);
      if (error instanceof Error) {
        if (error.message.includes('Record to update not found')) {
          return useResponse(c, { error: 'コレクションが見つかりません' }, 404);
        }
        if (error.message.includes('Unique constraint')) {
          return useResponse(
            c,
            { error: 'このデータセットには既に同じ名前のコレクションが存在します' },
            400
          );
        }
      }
      return useResponse(c, { error: 'コレクションの更新に失敗しました' }, 500);
    }
  }
);

// コレクション削除
app.delete('/:id', zValidator('param', z.object({ id: z.coerce.number() })), async (c) => {
  try {
    const { id } = c.req.valid('param');
    await collectionService.delete(id);
    return useResponse(c, { message: 'コレクションを削除しました' });
  } catch (error) {
    console.error('コレクション削除エラー:', error);
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return useResponse(c, { error: 'コレクションが見つかりません' }, 404);
    }
    return useResponse(c, { error: 'コレクションの削除に失敗しました' }, 500);
  }
});

// スタックをコレクションに追加
app.post(
  '/:id/stacks',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator(
    'json',
    z.object({
      stackId: z.number(),
      orderIndex: z.number().optional(),
    })
  ),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const { stackId, orderIndex } = c.req.valid('json');

      await collectionService.addStackToCollection(id, stackId, orderIndex);
      return useResponse(c, { message: 'スタックをコレクションに追加しました' });
    } catch (error) {
      console.error('スタック追加エラー:', error);
      if (error instanceof Error && error.message.includes('既にコレクションに追加されています')) {
        return useResponse(c, { error: error.message }, 400);
      }
      return useResponse(c, { error: 'スタックの追加に失敗しました' }, 500);
    }
  }
);

// スタックを一括でコレクションに追加
app.post(
  '/:id/stacks/bulk',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator(
    'json',
    z.object({
      stackIds: z.array(z.number()),
    })
  ),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const { stackIds } = c.req.valid('json');

      await collectionService.bulkAddStacksToCollection(id, stackIds);
      return useResponse(c, {
        message: `${stackIds.length}個のスタックをコレクションに追加しました`,
      });
    } catch (error) {
      console.error('スタック一括追加エラー:', error);
      return useResponse(c, { error: 'スタックの一括追加に失敗しました' }, 500);
    }
  }
);

// コレクション内のスタック取得
app.get(
  '/:id/stacks',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().default(50),
      offset: z.coerce.number().default(0),
    })
  ),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const { limit, offset } = c.req.valid('query');
      const col = await collectionService.findById(id);
      if (!col) return useResponse(c, { error: 'コレクションが見つかりません' }, 404);
      const { ensureDatasetAuthorized } = await import('../utils/dataset-protection');
      const auth = await ensureDatasetAuthorized(c as any, col.dataSetId);
      if (auth) return useResponse(c, auth as any);
      const result = await collectionService.getCollectionStacks(id, limit, offset);
      return useResponse(c, result);
    } catch (error) {
      console.error('コレクションスタック取得エラー:', error);
      return useResponse(c, { error: 'スタックの取得に失敗しました' }, 500);
    }
  }
);

// スタックをコレクションから削除
app.delete(
  '/:id/stacks/:stackId',
  zValidator(
    'param',
    z.object({
      id: z.coerce.number(),
      stackId: z.coerce.number(),
    })
  ),
  async (c) => {
    try {
      const { id, stackId } = c.req.valid('param');
      await collectionService.removeStackFromCollection(id, stackId);
      return useResponse(c, { message: 'スタックをコレクションから削除しました' });
    } catch (error) {
      console.error('スタック削除エラー:', error);
      return useResponse(c, { error: 'スタックの削除に失敗しました' }, 500);
    }
  }
);

// コレクション内のスタック順序変更
app.put(
  '/:id/stacks/reorder',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator(
    'json',
    z.object({
      stackOrders: z.array(
        z.object({
          stackId: z.number(),
          orderIndex: z.number(),
        })
      ),
    })
  ),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const { stackOrders } = c.req.valid('json');

      await collectionService.reorderStacksInCollection(id, stackOrders);
      return useResponse(c, { message: 'スタックの順序を更新しました' });
    } catch (error) {
      console.error('スタック順序変更エラー:', error);
      return useResponse(c, { error: 'スタック順序の変更に失敗しました' }, 500);
    }
  }
);

// スマートコレクションのスタック取得
app.get(
  '/:id/smart-stacks',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().default(50),
      offset: z.coerce.number().default(0),
    })
  ),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const { limit, offset } = c.req.valid('query');

      const result = await collectionService.getStacksByFilter(id, limit, offset);
      return useResponse(c, result);
    } catch (error) {
      console.error('スマートコレクションスタック取得エラー:', error);
      if (error instanceof Error && error.message.includes('無効なスマートコレクション')) {
        return useResponse(c, { error: error.message }, 400);
      }
      return useResponse(c, { error: 'スタックの取得に失敗しました' }, 500);
    }
  }
);

export const collectionsRoute = app;
