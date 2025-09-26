import { z } from 'zod';

// Accept SCRATCH in addition to SMART/MANUAL.
// SCRATCH behaves like a temporary MANUAL collection on the server side.
export const CollectionTypeSchema = z.enum(['SMART', 'MANUAL', 'SCRATCH']);

export const CreateCollectionSchema = z.object({
  name: z.string().min(1, 'コレクション名は必須です'),
  icon: z.string().default('📂'),
  description: z.string().optional(),
  type: CollectionTypeSchema.default('MANUAL'),
  dataSetId: z.number(),
  folderId: z.number().optional(), // 所属するフォルダID（ルートの場合は未指定）
  filterConfig: z.record(z.any()).optional(),
});

export const UpdateCollectionSchema = z.object({
  name: z.string().min(1, 'コレクション名は必須です').optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  type: CollectionTypeSchema.optional(),
  // フォルダ移動用: ルートへ移動は null を許可
  folderId: z.number().nullable().optional(),
  filterConfig: z.record(z.any()).optional(),
});

export const CollectionQuerySchema = z.object({
  dataSetId: z.coerce.number().optional(),
  folderId: z.coerce.number().optional(), // 特定のフォルダ内のコレクションを取得
  type: CollectionTypeSchema.optional(),
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0),
});

export type CreateCollectionInput = z.infer<typeof CreateCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof UpdateCollectionSchema>;
export type CollectionQuery = z.infer<typeof CollectionQuerySchema>;
export type CollectionType = z.infer<typeof CollectionTypeSchema>;
