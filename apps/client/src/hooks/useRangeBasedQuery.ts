import {
  isCancelledError,
  keepPreviousData,
  type QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { addSetValue } from '@/lib/set-utils';
import { getStackFilterKey } from '@/lib/stack-filter';
import type { MediaGridItem, StackFilter } from '@/types';

interface RangeBasedQueryOptions {
  datasetId: string;
  category?: string;
  filter: StackFilter;
  sort: any;
  pageSize?: number;
}

interface PageData {
  stacks: MediaGridItem[];
  total: number;
  offset: number;
  limit: number;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

// キャッシュ済みの page クエリから既にロード済みのページ番号を復元する
function getLoadedPagesFromCache(
  queryClient: QueryClient,
  datasetId: string,
  category: string | undefined,
  filterKey: string,
  sortKey: string
): Set<number> {
  const pages = queryClient.getQueriesData<PageData>({
    queryKey: ['stacks', 'page', datasetId, category, filterKey, sortKey],
  });
  const loaded = new Set<number>();
  for (const [key, data] of pages) {
    const pageIndex = key[6] as number;
    if (data && typeof pageIndex === 'number') {
      loaded.add(pageIndex);
    }
  }
  return loaded;
}

export function useRangeBasedQuery({
  datasetId,
  category,
  filter,
  sort,
  pageSize = 50,
}: RangeBasedQueryOptions) {
  const queryClient = useQueryClient();
  const filterKey = getStackFilterKey(filter);
  const sortKey = JSON.stringify(sort ?? {});
  const [loadedPages, setLoadedPages] = useState<Set<number>>(() =>
    getLoadedPagesFromCache(queryClient, datasetId, category, filterKey, sortKey)
  );
  const pageRequestsRef = useRef<Map<number, Promise<PageData | null>>>(new Map());
  const currentQueryKeyRef = useRef<string>('');

  // Keep track of previous query key to detect real changes
  const [previousQueryKey, setPreviousQueryKey] = useState<string>('');
  const currentQueryKey = `${datasetId}-${category}-${filterKey}-${sortKey}`;
  currentQueryKeyRef.current = currentQueryKey;

  // Reset loaded pages when key parameters change, but avoid unnecessary resets
  useEffect(() => {
    if (previousQueryKey && previousQueryKey !== currentQueryKey) {
      // Only reset if this is a real change, not initial load
      // 新しいフィルタ/ソートのキャッシュが既にあればそれを即座に反映する
      setLoadedPages(getLoadedPagesFromCache(queryClient, datasetId, category, filterKey, sortKey));
      pageRequestsRef.current.clear();
      window.scrollTo(0, 0);
    }
    setPreviousQueryKey(currentQueryKey);
  }, [currentQueryKey, previousQueryKey, queryClient, datasetId, category, filterKey, sortKey]);

  // Get total count first
  const {
    data: totalData,
    isLoading: isCountLoading,
    isFetching: isCountFetching,
  } = useQuery({
    queryKey: ['stacks', 'count', datasetId, category, filterKey, sortKey],
    queryFn: async ({ signal }) => {
      const result = await apiClient.getStacks(
        {
          datasetId,
          filter,
          sort,
          limit: 1,
          offset: 0,
        },
        { signal }
      );
      return { total: result.total };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - keep data fresh longer
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
    refetchOnMount: false, // Use cached data if available
    placeholderData: keepPreviousData, // フィルタ変更中も前回の total を保持し、高さの潰れを防ぐ
  });

  const total = totalData?.total || 0;

  // Load specific page
  const loadPage = useCallback(
    async (pageIndex: number): Promise<PageData | null> => {
      if (loadedPages.has(pageIndex)) {
        return (
          queryClient.getQueryData([
            'stacks',
            'page',
            datasetId,
            category,
            filterKey,
            sortKey,
            pageIndex,
          ]) || null
        );
      }

      const offset = pageIndex * pageSize;
      if (offset >= total) return null;
      const requestQueryKey = currentQueryKey;

      const existingRequest = pageRequestsRef.current.get(pageIndex);
      if (existingRequest) {
        return existingRequest;
      }

      const request = (async () => {
        const result = await queryClient.fetchQuery({
          queryKey: ['stacks', 'page', datasetId, category, filterKey, sortKey, pageIndex],
          queryFn: async ({ signal }) => {
            return await apiClient.getStacks(
              {
                datasetId,
                filter,
                sort,
                limit: pageSize,
                offset,
              },
              { signal }
            );
          },
          retry: 2,
          retryDelay: (failureCount) => Math.min(1000 * 2 ** failureCount, 4000),
          staleTime: 5 * 60 * 1000, // 5 minutes
          gcTime: 10 * 60 * 1000, // 10 minutes
        });

        if (currentQueryKeyRef.current === requestQueryKey) {
          setLoadedPages((prev) => addSetValue(prev, pageIndex));
        }
        return result as unknown as PageData;
      })()
        .catch((error) => {
          if (isCancelledError(error) || isAbortError(error)) {
            return null;
          }
          console.error('Failed to load page:', pageIndex, error);
          return null;
        })
        .finally(() => {
          pageRequestsRef.current.delete(pageIndex);
        });

      pageRequestsRef.current.set(pageIndex, request);
      return request;
    },
    [
      queryClient,
      datasetId,
      category,
      filter,
      sort,
      pageSize,
      total,
      loadedPages,
      filterKey,
      sortKey,
      currentQueryKey,
    ]
  );

  // Load specific range of items
  const loadRange = useCallback(
    async (startIndex: number, endIndex: number) => {
      const startPage = Math.floor(startIndex / pageSize);
      const endPage = Math.floor(endIndex / pageSize);

      // Check if all pages in range are already loaded
      const allPagesLoaded = (() => {
        for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
          if (!loadedPages.has(pageIndex)) return false;
        }
        return true;
      })();

      if (allPagesLoaded) {
        return;
      }

      // Load only unloaded pages - sequentially with throttling
      const pagesToLoad: number[] = [];
      for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
        if (!loadedPages.has(pageIndex)) {
          pagesToLoad.push(pageIndex);
        }
      }

      // Optionally prefetch one extra page ahead if budget allows
      const MAX_PAGES_PER_BATCH = 2;
      if (pagesToLoad.length < MAX_PAGES_PER_BATCH) {
        const nextPage = endPage + 1;
        const nextOffset = nextPage * pageSize;
        if (nextOffset < total && !loadedPages.has(nextPage)) {
          pagesToLoad.push(nextPage);
        }
      }

      const limitedPages = pagesToLoad.slice(0, MAX_PAGES_PER_BATCH);

      for (const pageIndex of limitedPages) {
        await loadPage(pageIndex);
        // Add delay between requests to prevent server overload
        if (pageIndex !== limitedPages[limitedPages.length - 1]) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    },
    [loadPage, pageSize, loadedPages, total]
  );

  // Get all loaded items as a sparse array
  const allItems = useMemo(() => {
    const items: (MediaGridItem | undefined)[] = new Array(total).fill(undefined);

    for (const pageIndex of loadedPages) {
      const pageData = queryClient.getQueryData<PageData>([
        'stacks',
        'page',
        datasetId,
        category,
        filterKey,
        sortKey,
        pageIndex,
      ]);

      if (pageData) {
        const startIndex = pageIndex * pageSize;
        pageData.stacks.forEach((item, index) => {
          const targetIndex = startIndex + index;
          if (targetIndex < items.length) {
            items[targetIndex] = item;
          }
        });
      }
    }

    return items;
  }, [queryClient, datasetId, category, loadedPages, pageSize, total, filterKey, sortKey]);

  // Check if a specific range is loaded
  const isRangeLoaded = useCallback(
    (startIndex: number, endIndex: number) => {
      const startPage = Math.floor(startIndex / pageSize);
      const endPage = Math.floor(endIndex / pageSize);

      for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
        if (!loadedPages.has(pageIndex)) return false;
      }
      return true;
    },
    [loadedPages, pageSize]
  );

  // Get items in a specific range
  const getItemsInRange = useCallback(
    (startIndex: number, endIndex: number) => {
      return allItems
        .slice(startIndex, endIndex + 1)
        .filter((item) => item !== undefined) as MediaGridItem[];
    },
    [allItems]
  );

  // Force refresh all loaded data
  const refreshAll = useCallback(async () => {
    // Invalidate count query
    await queryClient.invalidateQueries({
      queryKey: ['stacks', 'count', datasetId, category, filterKey, sortKey],
    });

    // Invalidate all loaded pages
    const pagePromises: Promise<void>[] = [];
    for (const pageIndex of loadedPages) {
      pagePromises.push(
        queryClient.invalidateQueries({
          queryKey: ['stacks', 'page', datasetId, category, filterKey, sortKey, pageIndex],
        })
      );
    }

    await Promise.all(pagePromises);

    // Clear loaded pages to force reload
    setLoadedPages(new Set());
  }, [queryClient, datasetId, category, loadedPages, filterKey, sortKey]);

  return {
    total,
    allItems,
    loadedPages,
    loadRange,
    loadPage,
    isRangeLoaded,
    getItemsInRange,
    isLoading: isCountLoading || (loadedPages.size === 0 && total > 0), // Loading if count is loading or no pages loaded yet
    isFetching: isCountFetching,
    refreshAll,
  };
}
