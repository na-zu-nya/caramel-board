import { toPublicAssetPath, withPublicAssetArray } from './assetPath';

/**
 * Common helper functions for stack processing
 */

export interface StackWithAssets {
  thumbnail?: string | null;
  dataSetId?: number;
  assets?: Array<{
    id: number;
    thumbnail?: string | null;
  }>;
  [key: string]: any;
}

/**
 * Process stack to extract thumbnail from first asset
 * Priority: First asset's thumbnail > stack's own thumbnail > empty string
 */
export function processStackThumbnail<T extends StackWithAssets>(
  stack: T
): T & { thumbnail: string } {
  const assets = withPublicAssetArray(stack.assets as any[], stack.dataSetId);
  const thumbnail = toPublicAssetPath(assets[0]?.thumbnail || stack.thumbnail, stack.dataSetId);

  return {
    ...stack,
    assets,
    thumbnail: thumbnail || '',
  };
}

/**
 * Process multiple stacks to extract thumbnails
 */
export function processStacksThumbnails<T extends StackWithAssets>(
  stacks: T[]
): (T & { thumbnail: string })[] {
  return stacks.map((stack) => processStackThumbnail(stack));
}

/**
 * Common include configuration for stack queries with thumbnail
 */
export const STACK_THUMBNAIL_INCLUDE = {
  assets: {
    take: 1,
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      thumbnail: true,
    },
  },
} as const;

/**
 * Common include configuration for stack list queries
 */
export const STACK_LIST_INCLUDE = {
  ...STACK_THUMBNAIL_INCLUDE,
  author: {
    select: {
      id: true,
      name: true,
    },
  },
  _count: {
    select: {
      assets: true,
    },
  },
} as const;

/**
 * Common include configuration for stack list with tags
 */
export const STACK_LIST_WITH_TAGS_INCLUDE = {
  ...STACK_LIST_INCLUDE,
  tags: {
    include: {
      tag: true,
    },
  },
} as const;
