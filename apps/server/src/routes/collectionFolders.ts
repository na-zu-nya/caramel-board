import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  CollectionFolderQuerySchema,
  CreateCollectionFolderSchema,
  FolderTreeQuerySchema,
  UpdateCollectionFolderSchema,
} from '../models/CollectionFolderModel.js';
import { ensureDatasetAuthorizedForCurrentStore } from '../repositories/sqlite/auth';
import { StandaloneLibraryRepository } from '../repositories/sqlite/library-repository';
import { useResponse } from '../utils/useResponse.js';

const app = new Hono();
const libraryRepository = new StandaloneLibraryRepository();

type FolderOrderInput = {
  folderId: number;
  order: number;
};

const ensureAuthorized = async (c: Context, dataSetId: number) => {
  return ensureDatasetAuthorizedForCurrentStore(c, dataSetId);
};

// フォルダ一覧取得
app.get('/', zValidator('query', CollectionFolderQuerySchema), async (c) => {
  try {
    const query = c.req.valid('query');
    const ds = query.dataSetId ?? null;
    if (ds !== null) {
      const auth = await ensureAuthorized(c, ds);
      if (auth) return auth;
    }
    const result = libraryRepository.getFolderList(query);
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
    const auth = await ensureAuthorized(c, query.dataSetId);
    if (auth) return auth;
    const result = libraryRepository.getFolderTree(query);
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
    const folder = libraryRepository.getFolder(id, { includeCollections: true });
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
    const folder = libraryRepository.createFolder(data);
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
      const folder = libraryRepository.updateFolder(id, data);
      if (!folder) return useResponse(c, { error: 'フォルダが見つかりません' }, 404);
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
    const result = libraryRepository.deleteFolder(id);
    if (!result.ok && result.reason === 'missing') {
      return useResponse(c, { error: 'フォルダが見つかりません' }, 404);
    }
    if (!result.ok && result.reason === 'not-empty') {
      return useResponse(c, { error: 'フォルダを削除するには、中身を空にする必要があります' }, 400);
    }
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
      const { folderOrders } = c.req.valid('json') as { folderOrders: FolderOrderInput[] };
      const folder = libraryRepository.getFolder(id);
      if (!folder) {
        return useResponse(c, { error: 'フォルダが見つかりません' }, 404);
      }
      libraryRepository.reorderFolders(folderOrders);
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
      const result = libraryRepository.moveFolder(id, newParentId || null);
      if (!result) return useResponse(c, { error: 'フォルダが見つかりません' }, 404);
      if ('error' in result && result.error === 'cycle') {
        return useResponse(
          c,
          { error: 'フォルダを自分自身や子孫フォルダに移動することはできません' },
          400
        );
      }
      return useResponse(c, result);
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
