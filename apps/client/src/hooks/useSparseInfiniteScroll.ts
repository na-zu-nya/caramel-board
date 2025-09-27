import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { MediaGridItem, StackFilter } from '@/types';

interface SparseInfiniteScrollOptions {
  datasetId: string;
  mediaType?: string;
  filter: StackFilter;
  sort: any;
  pageSize?: number;
  throttleMs?: number;
}

interface LoadRequest {
  startIndex: number;
  endIndex: number;
  timestamp: number;
}

export function useSparseInfiniteScroll({
  datasetId,
  mediaType,
  filter,
  sort,
  throttleMs = 300,
}: SparseInfiniteScrollOptions) {
  const queryClient = useQueryClient();
  const [sparseItems, setSparseItems] = useState<(MediaGridItem | undefined)[]>([]);
  const [loadingRanges, setLoadingRanges] = useState<Set<string>>(new Set());
  const throttleTimeoutRef = useRef<number | null>(null);
  const pendingRequestRef = useRef<LoadRequest | null>(null);
  const [lastVisibleRange, setLastVisibleRange] = useState<{ start: number; end: number } | null>(
    null
  );

  // Keep track of previous query key to detect real changes
  const [previousQueryKey, setPreviousQueryKey] = useState<string>('');
  const currentQueryKey = `${datasetId}-${mediaType}-${JSON.stringify(filter)}-${JSON.stringify(sort)}`;

  // Reset sparse array when key parameters change
  useEffect(() => {
    if (previousQueryKey && previousQueryKey !== currentQueryKey) {
      setSparseItems([]);
      setLoadingRanges(new Set());
      setLastVisibleRange(null); // Reset last visible range when filters change
    }
    setPreviousQueryKey(currentQueryKey);
  }, [currentQueryKey, previousQueryKey]);

  // Get total count first
  const {
    data: totalData,
    isLoading: isCountLoading,
    isFetching: isCountFetching,
  } = useQuery({
    queryKey: ['stacks', 'count', datasetId, mediaType, filter, sort],
    queryFn: async () => {
      const result = await apiClient.getStacks({
        datasetId,
        filter,
        sort,
        limit: 1,
        offset: 0,
      });
      return { total: result.total };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const total = totalData?.total || 0;

  // Initialize sparse array when total is known
  useEffect(() => {
    if (total > 0 && sparseItems.length !== total) {
      setSparseItems(new Array(total).fill(undefined));
    }
  }, [total, sparseItems.length]);

  // Load specific range
  const loadRange = useCallback(
    async (startIndex: number, endIndex: number) => {
      if (startIndex >= total || endIndex < 0) return;

      const normalizedStart = Math.max(0, startIndex);
      const normalizedEnd = Math.min(total - 1, endIndex);
      const rangeKey = `${normalizedStart}-${normalizedEnd}`;

      // Skip if already loading this range or a similar range
      for (const key of loadingRanges) {
        const [loadingStart, loadingEnd] = key.split('-').map(Number);
        // Check if ranges overlap significantly
        if (
          (normalizedStart >= loadingStart && normalizedStart <= loadingEnd) ||
          (normalizedEnd >= loadingStart && normalizedEnd <= loadingEnd) ||
          (loadingStart >= normalizedStart && loadingStart <= normalizedEnd)
        ) {
          console.log(
            `⏭️ Skipping range ${normalizedStart}-${normalizedEnd}, overlaps with loading range ${key}`
          );
          return;
        }
      }

      setLoadingRanges((prev) => new Set([...prev, rangeKey]));

      try {
        const offset = normalizedStart;
        const limit = normalizedEnd - normalizedStart + 1;

        console.log(`🔄 Loading range ${normalizedStart}-${normalizedEnd} (${limit} items)`);

        const result = await apiClient.getStacks({
          datasetId,
          filter,
          sort,
          limit,
          offset,
        });

        // Update sparse array with loaded items
        setSparseItems((prev) => {
          const newItems = [...prev];
          result.stacks.forEach((item, index) => {
            const targetIndex = normalizedStart + index;
            if (targetIndex < newItems.length) {
              // Convert Stack to MediaGridItem
              newItems[targetIndex] = {
                ...item, // spread all properties first
                // Ensure MediaGridItem compatibility
                favorited: item.favorited ?? item.isFavorite,
                isFavorite: item.isFavorite ?? item.favorited,
              } as MediaGridItem;
            }
          });
          return newItems;
        });

        console.log(
          `✅ Loaded ${result.stacks.length} items for range ${normalizedStart}-${normalizedEnd}`
        );
      } catch (error) {
        console.error(`❌ Failed to load range ${normalizedStart}-${normalizedEnd}:`, error);
      } finally {
        setLoadingRanges((prev) => {
          const next = new Set(prev);
          next.delete(rangeKey);
          return next;
        });
      }
    },
    [total, datasetId, filter, sort, loadingRanges]
  );

  // Throttled load range request
  const requestLoadRange = useCallback(
    (startIndex: number, endIndex: number) => {
      // Track visible range for return navigation
      setLastVisibleRange({ start: startIndex, end: endIndex });

      const request: LoadRequest = {
        startIndex,
        endIndex,
        timestamp: Date.now(),
      };

      pendingRequestRef.current = request;

      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }

      throttleTimeoutRef.current = window.setTimeout(() => {
        const currentRequest = pendingRequestRef.current;
        if (currentRequest && currentRequest.timestamp === request.timestamp) {
          void loadRange(currentRequest.startIndex, currentRequest.endIndex);
          pendingRequestRef.current = null;
        }
      }, throttleMs);
    },
    [loadRange, throttleMs]
  );

  // Check if a specific range is loaded or loading
  const isRangeLoaded = useCallback(
    (startIndex: number, endIndex: number) => {
      const normalizedStart = Math.max(0, startIndex);
      const normalizedEnd = Math.min(total - 1, endIndex);

      // Check if this exact range or an overlapping range is currently loading
      for (const key of loadingRanges) {
        const [loadingStart, loadingEnd] = key.split('-').map(Number);
        if (
          (normalizedStart >= loadingStart && normalizedStart <= loadingEnd) ||
          (normalizedEnd >= loadingStart && normalizedEnd <= loadingEnd) ||
          (loadingStart >= normalizedStart && loadingStart <= normalizedEnd)
        ) {
          return true; // Consider as loaded to prevent duplicate requests
        }
      }

      // Check if all items in range are loaded
      for (let i = normalizedStart; i <= normalizedEnd; i++) {
        if (sparseItems[i] === undefined) {
          return false;
        }
      }
      return true;
    },
    [sparseItems, total, loadingRanges]
  );

  // Get items in a specific range (including undefined slots)
  const getItemsInRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const normalizedStart = Math.max(0, startIndex);
      const normalizedEnd = Math.min(total - 1, endIndex);

      return sparseItems.slice(normalizedStart, normalizedEnd + 1);
    },
    [sparseItems, total]
  );

  // Check if any range is currently loading
  const isLoading = useMemo(() => {
    return loadingRanges.size > 0 || isCountLoading;
  }, [loadingRanges.size, isCountLoading]);

  // Get loading percentage for UI feedback
  const loadingProgress = useMemo(() => {
    if (total === 0) return 0;
    const loadedCount = sparseItems.filter((item) => item !== undefined).length;
    return (loadedCount / total) * 100;
  }, [sparseItems, total]);

  // Force refresh all loaded data
  const refreshAll = useCallback(async () => {
    console.log('🔄 Force refreshing all data...');

    // Invalidate count query
    await queryClient.invalidateQueries({
      queryKey: ['stacks', 'count', datasetId, mediaType, filter, sort],
    });

    // Clear sparse array and force reload
    setSparseItems([]);
    setLoadingRanges(new Set());
  }, [queryClient, datasetId, mediaType, filter, sort]);

  return {
    total,
    sparseItems,
    loadingRanges,
    requestLoadRange,
    isRangeLoaded,
    getItemsInRange,
    isLoading,
    isFetching: isCountFetching,
    loadingProgress,
    refreshAll,
    lastVisibleRange,
  };
}
