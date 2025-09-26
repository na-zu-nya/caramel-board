import { z } from 'zod';

// 検索モード
export const SearchModeSchema = z.enum(['all', 'similar', 'unified']);

// 作者フィルタ
export const AuthorFilterSchema = z.object({
  include: z.array(z.string()).optional(),
  includeAny: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  includeNotSet: z.boolean().optional(),
}).optional();

// タグフィルタ
export const TagFilterSchema = z.object({
  include: z.array(z.string()).optional(),
  includeAny: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  includeNotSet: z.boolean().optional(),
}).optional();

// 色フィルタ
export const ColorFilterSchema = z.object({
  hue: z.number().min(0).max(360).optional(),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  tones: z.object({
    brightness: z.object({
      min: z.number().min(0).max(100),
      max: z.number().min(0).max(100),
    }).optional(),
    saturation: z.object({
      min: z.number().min(0).max(100),
      max: z.number().min(0).max(100),
    }).optional(),
  }).optional(),
}).optional();

// 検索フィルタ
export const SearchFiltersSchema = z.object({
  author: AuthorFilterSchema,
  tags: TagFilterSchema,
  favorites: z.enum(['is-fav', 'not-fav']).optional(),
  likes: z.enum(['is-liked', 'not-liked']).optional(),
  color: ColorFilterSchema,
  mediaType: z.enum(['all', 'image', 'comic', 'video']).optional(),
  collectionId: z.number().int().positive().optional(),
  includeAutoTags: z.boolean().optional(),
});

// ソートオプション
export const SortOptionsSchema = z.object({
  by: z.enum(['recommended', 'dateAdded', 'name', 'likes', 'updated']).default('recommended'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ページネーション
export const PaginationOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

// 統合検索クエリスキーマ
export const SearchQuerySchema = z.object({
  // 検索モード
  mode: SearchModeSchema.optional().default('all'),
  
  // モード別パラメータ
  referenceStackId: z.coerce.number().int().positive().optional(),
  query: z.string().optional(),
  
  // フィルタ（JSON文字列またはオブジェクト）
  filters: z.union([
    z.string().transform((val) => {
      try {
        return SearchFiltersSchema.parse(JSON.parse(val));
      } catch {
        return {};
      }
    }),
    SearchFiltersSchema
  ]).optional().default({}),
  
  // ソート（JSON文字列またはオブジェクト）
  sort: z.union([
    z.string().transform((val) => {
      try {
        return SortOptionsSchema.parse(JSON.parse(val));
      } catch {
        return { by: 'recommended', order: 'desc' };
      }
    }),
    SortOptionsSchema
  ]).optional().default({ by: 'recommended', order: 'desc' }),
  
  // ページネーション
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});