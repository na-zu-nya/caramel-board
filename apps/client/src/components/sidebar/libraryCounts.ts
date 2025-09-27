import type { QueryClient } from '@tanstack/react-query';

export type LibraryCounts = {
  favorites: number;
  likes: number;
  image: number;
  comic: number;
  video: number;
  scratch: number;
};

/**
 * Optimistically adjust library counts cache for a dataset.
 * It searches all matching query keys that start with ['library-counts', datasetId]
 * (including different scratchId suffixes) and applies delta updates.
 */
export function adjustLibraryCounts(
  queryClient: QueryClient,
  datasetId: string | number,
  deltas: Partial<Record<keyof LibraryCounts, number>>
) {
  try {
    const entries = queryClient.getQueriesData<LibraryCounts>({
      queryKey: ['library-counts', datasetId],
    });
    for (const [qk, data] of entries) {
      if (!data) continue;
      const next: LibraryCounts = { ...data } as LibraryCounts;
      for (const [k, v] of Object.entries(deltas)) {
        if (typeof v === 'number') {
          const key = k as keyof LibraryCounts;
          next[key] = Math.max(0, (next[key] ?? 0) + v);
        }
      }
      queryClient.setQueryData(qk as any, next);
    }
  } catch (e) {
    console.warn('adjustLibraryCounts failed:', e);
  }
}
