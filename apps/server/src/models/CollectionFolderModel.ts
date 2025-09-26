import { z } from 'zod';

export const CreateCollectionFolderSchema = z.object({
  name: z.string().min(1, 'フォルダ名は必須です'),
  icon: z.string().default('📁'),
  description: z.string().optional(),
  dataSetId: z.number(),
  parentId: z.number().optional(), // 親フォルダID（ルートの場合は未指定）
  order: z.number().default(0), // 同じ階層での並び順
});

export const UpdateCollectionFolderSchema = z.object({
  name: z.string().min(1, 'フォルダ名は必須です').optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  parentId: z.number().optional(), // フォルダ移動用
  order: z.number().optional(), // 並び順変更用
});

export const CollectionFolderQuerySchema = z.object({
  dataSetId: z.coerce.number().optional(),
  parentId: z.coerce.number().optional(), // 特定の親フォルダの子フォルダを取得
  includeCollections: z.coerce.boolean().default(false), // フォルダ内のコレクションも含めるか
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0),
});

export const FolderTreeQuerySchema = z.object({
  dataSetId: z.coerce.number(),
  includeCollections: z.coerce.boolean().default(true), // フォルダ階層とコレクションを含む完全なツリー
});

export type CreateCollectionFolderInput = z.infer<typeof CreateCollectionFolderSchema>;
export type UpdateCollectionFolderInput = z.infer<typeof UpdateCollectionFolderSchema>;
export type CollectionFolderQuery = z.infer<typeof CollectionFolderQuerySchema>;
export type FolderTreeQuery = z.infer<typeof FolderTreeQuerySchema>;
