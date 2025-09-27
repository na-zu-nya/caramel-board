import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { getPrisma } from '../lib/Repository.js';
import {
  CollectionFolderQuerySchema,
  CreateCollectionFolderSchema,
  FolderTreeQuerySchema,
  UpdateCollectionFolderSchema,
} from '../models/CollectionFolderModel.js';
import { CollectionFolderService } from '../shared/services/CollectionFolderService';
import { useResponse } from '../utils/useResponse.js';

const app = new Hono();
const collectionFolderService = new CollectionFolderService(getPrisma());

// フォルダ一覧取得
app.get('/', zValidator('query', CollectionFolderQuerySchema), async (c) => {
  try {
    const query = c.req.valid('query');
    const ds = query.dataSetId ?? null;
    if (ds !== null) {
      const { ensureDatasetAuthorized } = await import('../utils/dataset-protection');
      const auth = await ensureDatasetAuthorized(c as any, ds);
      if (auth) return auth as any;
    }
    const result = await collectionFolderService.findAll(query);
    return useResponse(c, result);
  } catch (error) {
    console.error('フォルダ一覧取得エラー:', error);
    return useResponse(c, { error: 'フォルダ一覧の取得に失敗しました' }, 500);
  }
});

// フォルダツリー取得
app.get('/tree', zValidator('query', FolderTreeQuerySchema), async (c) => {
  try {
    const query = c.req.valid('query');
    const { ensureDatasetAuthorized } = await import('../utils/dataset-protection');
    const auth = await ensureDatasetAuthorized(c as any, query.dataSetId);
    if (auth) return auth as any;
    const result = await collectionFolderService.getFolderTree(query);
    return useResponse(c, result);
  } catch (error) {
    console.error('フォルダツリー取得エラー:', error);
    return useResponse(c, { error: 'フォルダツリーの取得に失敗しました' }, 500);
  }
});

// フォルダ詳細取得
app.get('/:id', zValidator('param', z.object({ id: z.coerce.number() })), async (c) => {
  try {
    const { id } = c.req.valid('param');
    const folder = await collectionFolderService.findById(id);

    if (!folder) {
      return useResponse(c, { error: 'フォルダが見つかりません' }, 404);
    }

    return useResponse(c, folder);
  } catch (error) {
    console.error('フォルダ詳細取得エラー:', error);
    return useResponse(c, { error: 'フォルダ詳細の取得に失敗しました' }, 500);
  }
});

// フォルダ作成
app.post('/', zValidator('json', CreateCollectionFolderSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const folder = await collectionFolderService.create(data);
    return useResponse(c, folder, 201);
  } catch (error) {
    console.error('フォルダ作成エラー:', error);
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return useResponse(c, { error: 'この場所には既に同じ名前のフォルダが存在します' }, 400);
      }
    }
    return useResponse(c, { error: 'フォルダの作成に失敗しました' }, 500);
  }
});

// フォルダ更新
app.put(
  '/:id',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator('json', UpdateCollectionFolderSchema),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const data = c.req.valid('json');
      const folder = await collectionFolderService.update(id, data);
      return useResponse(c, folder);
    } catch (error) {
      console.error('フォルダ更新エラー:', error);
      if (error instanceof Error) {
        if (error.message.includes('Record to update not found')) {
          return useResponse(c, { error: 'フォルダが見つかりません' }, 404);
        }
        if (error.message.includes('Unique constraint')) {
          return useResponse(c, { error: 'この場所には既に同じ名前のフォルダが存在します' }, 400);
        }
      }
      return useResponse(c, { error: 'フォルダの更新に失敗しました' }, 500);
    }
  }
);

// フォルダ削除
app.delete('/:id', zValidator('param', z.object({ id: z.coerce.number() })), async (c) => {
  try {
    const { id } = c.req.valid('param');
    await collectionFolderService.delete(id);
    return useResponse(c, { message: 'フォルダを削除しました' });
  } catch (error) {
    console.error('フォルダ削除エラー:', error);
    if (error instanceof Error) {
      if (error.message.includes('Record to delete does not exist')) {
        return useResponse(c, { error: 'フォルダが見つかりません' }, 404);
      }
      if (error.message.includes('中身を空にする必要があります')) {
        return useResponse(
          c,
          { error: 'フォルダを削除するには、中身を空にする必要があります' },
          400
        );
      }
    }
    return useResponse(c, { error: 'フォルダの削除に失敗しました' }, 500);
  }
});

// フォルダ順序変更
app.put(
  '/:id/reorder',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator(
    'json',
    z.object({
      parentId: z.number().optional(),
      folderOrders: z.array(
        z.object({
          folderId: z.number(),
          order: z.number(),
        })
      ),
    })
  ),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const { parentId, folderOrders } = c.req.valid('json');

      // 現在のフォルダの情報を取得してdataSetIdを確認
      const folder = await collectionFolderService.findById(id);
      if (!folder) {
        return useResponse(c, { error: 'フォルダが見つかりません' }, 404);
      }

      await collectionFolderService.reorderFolders(
        folder.dataSetId,
        parentId || null,
        folderOrders
      );
      return useResponse(c, { message: 'フォルダの順序を更新しました' });
    } catch (error) {
      console.error('フォルダ順序変更エラー:', error);
      return useResponse(c, { error: 'フォルダ順序の変更に失敗しました' }, 500);
    }
  }
);

// フォルダ移動
app.put(
  '/:id/move',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator(
    'json',
    z.object({
      newParentId: z.number().optional(),
    })
  ),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const { newParentId } = c.req.valid('json');

      const folder = await collectionFolderService.moveFolder(id, newParentId || null);
      return useResponse(c, folder);
    } catch (error) {
      console.error('フォルダ移動エラー:', error);
      if (error instanceof Error && error.message.includes('循環参照')) {
        return useResponse(c, { error: error.message }, 400);
      }
      return useResponse(c, { error: 'フォルダの移動に失敗しました' }, 500);
    }
  }
);

export const collectionFoldersRoute = app;
