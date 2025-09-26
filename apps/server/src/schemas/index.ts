import {z} from 'zod';

// Common schemas
export const IdParamSchema = z.object({
  id: z.string().transform(Number).pipe(z.number().int().positive()),
});

export const DatasetIdParamSchema = z.object({
  dataSetId: z.coerce.number().int().positive(),
});

export const PaginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 50))
    .pipe(z.number().int().min(1).max(200)), // Reduced from 1000 to 200
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 0))
    .pipe(z.number().int().min(0)),
  mediaType: z.enum(['image', 'comic', 'video']).optional(),
});

// Extended pagination for management operations (higher limits)
export const ManagementPaginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 50))
    .pipe(z.number().int().min(1).max(2000)), // Higher limit for management operations
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 0))
    .pipe(z.number().int().min(0)),
  dataSetId: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().int().positive().optional()),
});

export const FilterSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 50))
    .pipe(z.number().int().min(1).max(100)), // Reduced from 1000 to 100 for paginated endpoint
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 0))
    .pipe(z.number().int().min(0)),
  mediaType: z.enum(['image', 'comic', 'video']).optional(),
  tag: z.union([z.string(), z.array(z.string())]).optional(),
  author: z.string().optional(),
  fav: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().optional()),
  liked: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().optional()),
  sort: z.enum(['id', 'name', 'createdAt', 'updateAt', 'liked', 'recommended']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  // Collection filter
  collection: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().optional()),
  // 色域フィルタパラメータ
  hueCategories: z.union([z.string(), z.array(z.string())]).optional(),
  toneSaturation: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().min(0).max(100).optional()),
  toneLightness: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().min(0).max(100).optional()),
  toneTolerance: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().min(0).max(100).optional()),
  similarityThreshold: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().min(0).max(100).optional()),
  customColor: z.string().optional(),
  // AutoTag filter
  autoTag: z.union([z.string(), z.array(z.string())]).optional(),
  // similarity search
  referenceStackId: z.coerce.number().int().positive().optional(),
  // free-word text search
  search: z.string().optional(),
});

// Stack schemas
export const CreateStackSchema = z.object({
  name: z.string().min(1),
  mediaType: z.enum(['image', 'comic', 'video']).optional().default('image'),
  thumbnail: z.string().optional(),
});

export const UpdateStackSchema = z.object({
  name: z.string().min(1).optional(),
  thumbnail: z.string().optional(),
  meta: z.record(z.any()).optional(),
  mediaType: z.enum(['image', 'comic', 'video']).optional(),
});

export const StackQuerySchema = z.object({
  assets: z
    .string()
    .optional()
    .transform((val) => val !== 'false')
    .default('true'),
  tags: z
    .string()
    .optional()
    .transform((val) => val !== 'false')
    .default('true'),
  author: z
    .string()
    .optional()
    .transform((val) => val !== 'false')
    .default('true'),
});

// Asset schemas
export const CreateAssetSchema = z.object({
  stackId: z.number().int().positive(),
  file: z.string(),
  fileType: z.string(),
  thumbnail: z.string().optional(),
});

// Tag schemas
export const CreateTagSchema = z.object({
  title: z.string().min(1),
});

export const TagStackSchema = z.object({
  stackId: z.number().int().positive(),
  tagIds: z.array(z.number().int().positive()),
});

// AutoTag schemas
export const AutoTagPredictSchema = z.object({
  threshold: z.number().min(0).max(1).optional().default(0.4),
});

export const AutoTagAggregateSchema = z.object({
  threshold: z.number().min(0).max(1).optional().default(0.4),
  batchSize: z.number().int().min(1).max(20).optional().default(5),
});

// Similarity search schema
export const SimilaritySearchSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(Number(val), 100) : 20))
    .pipe(z.number().int().min(1).max(100)),
  threshold: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 0.1))
    .pipe(z.number().min(0).max(1)),
});

export type IdParam = z.infer<typeof IdParamSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type ManagementPagination = z.infer<typeof ManagementPaginationSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type CreateStack = z.infer<typeof CreateStackSchema>;
export type UpdateStack = z.infer<typeof UpdateStackSchema>;
export type StackQuery = z.infer<typeof StackQuerySchema>;
export type CreateAsset = z.infer<typeof CreateAssetSchema>;
export type CreateTag = z.infer<typeof CreateTagSchema>;
export type TagStack = z.infer<typeof TagStackSchema>;
// Bulk operation schemas
export const BulkTagsSchema = z.object({
  stackIds: z.array(z.number().int().positive()).min(1),
  tags: z.array(z.string().min(1)).min(1),
});

export const BulkAuthorSchema = z.object({
  stackIds: z.array(z.number().int().positive()).min(1),
  author: z.string().min(1),
});

export const BulkMediaTypeSchema = z.object({
  stackIds: z.array(z.number().int().positive()).min(1),
  mediaType: z.enum(['image', 'comic', 'video']),
});

export const BulkFavoriteSchema = z.object({
  stackIds: z.array(z.number().int().positive()).min(1),
  favorited: z.boolean(),
});

export const BulkRefreshThumbnailsSchema = z.object({
  stackIds: z.array(z.number().int().positive()).min(1),
});

export const BulkRemoveStacksSchema = z.object({
  stackIds: z.array(z.number().int().positive()).min(1),
});

export type AutoTagPredict = z.infer<typeof AutoTagPredictSchema>;
export type AutoTagAggregate = z.infer<typeof AutoTagAggregateSchema>;
export type SimilaritySearch = z.infer<typeof SimilaritySearchSchema>;
export type BulkTags = z.infer<typeof BulkTagsSchema>;
export type BulkAuthor = z.infer<typeof BulkAuthorSchema>;
export type BulkMediaType = z.infer<typeof BulkMediaTypeSchema>;
export type BulkFavorite = z.infer<typeof BulkFavoriteSchema>;
export type BulkRefreshThumbnails = z.infer<typeof BulkRefreshThumbnailsSchema>;
export type BulkRemoveStacks = z.infer<typeof BulkRemoveStacksSchema>;
