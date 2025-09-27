import { toPublicAssetPath } from './assetPath';

/**
 * Utility functions for handling thumbnail paths
 */

/**
 * Format thumbnail path to include leading slash
 * @param thumbnail - Original thumbnail path
 * @returns Formatted thumbnail path with leading slash
 */
export function formatThumbnailPath(thumbnail: string | null | undefined): string {
  return toPublicAssetPath(thumbnail);
}

/**
 * Process stack object to format thumbnail path
 */
export function formatStackThumbnail<
  T extends {
    thumbnail?: string | null;
    dataSetId: number;
  },
>(stack: T): T {
  return {
    ...stack,
    thumbnail: toPublicAssetPath(stack.thumbnail, stack.dataSetId),
  };
}

/**
 * Process multiple stacks to format thumbnail paths
 */
export function formatStacksThumbnails<
  T extends {
    thumbnail?: string | null;
    dataSetId: number;
  },
>(stacks: T[]): T[] {
  return stacks.map((stack) => formatStackThumbnail(stack));
}
