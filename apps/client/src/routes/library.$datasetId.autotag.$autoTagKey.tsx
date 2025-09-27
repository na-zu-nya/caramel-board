import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import StackGrid from '@/components/StackGrid';
import { useDataset } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { apiClient } from '@/lib/api-client';
import { navigationStateAtom } from '@/stores/navigation';
import { currentFilterAtom } from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaGridItem } from '@/types';

export const Route = createFileRoute('/library/$datasetId/autotag/$autoTagKey')({
  component: AutoTagStacksPage,
});

function AutoTagStacksPage() {
  const { datasetId, autoTagKey } = Route.useParams();
  const { data: dataset } = useDataset(datasetId);
  const navigate = useNavigate();
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);

  // Decode autoTagKey from URL (二重エンコード対策)
  const decodedKey = useMemo(() => {
    try {
      const once = decodeURIComponent(autoTagKey);
      return once.includes('%') ? decodeURIComponent(once) : once;
    } catch {
      return autoTagKey;
    }
  }, [autoTagKey]);

  // Header actions: use global FilterPanel for consistency
  useHeaderActions({ showShuffle: true, showFilter: true, showSelection: true });

  // Local sparse array state
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<(MediaGridItem | undefined)[]>([]);
  const itemsRef = useRef<(MediaGridItem | undefined)[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRangesRef = useRef<Set<string>>(new Set());
  const isEmptyRef = useRef(false);
  const epochRef = useRef(0);
  const [navigationState, setNavigationState] = useAtom(navigationStateAtom);

  const restoreScrollSafely = useCallback((targetY: number, retries = 40, delay = 50) => {
    let cancelled = false;
    const step = (n: number) => {
      if (cancelled) return;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll >= Math.max(0, targetY - 10)) {
        window.scrollTo(0, targetY);
        return;
      }
      if (n <= 0) return;
      setTimeout(() => requestAnimationFrame(() => step(n - 1)), delay);
    };
    step(retries);
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize/reset when key changes
  useEffect(() => {
    // Start new epoch for this AutoTag key
    epochRef.current += 1;
    setIsLoading(true);
    setItems([]);
    itemsRef.current = [];
    setTotal(0);
    isEmptyRef.current = false;
    loadingRangesRef.current.clear();
    // Keep currentFilter with datasetId context for other UI parts
    setCurrentFilter({ datasetId });
  }, [datasetId, decodedKey, setCurrentFilter]);

  // Stable key for filters (only fields supported by the endpoint)
  const filterKey = useMemo(() => {
    const f = currentFilter || ({} as any);
    const key = {
      mediaType: f.mediaType ?? undefined,
      search: f.search ?? undefined,
      authors: Array.isArray(f.authors) ? [...f.authors].sort() : undefined,
      tags: Array.isArray(f.tags) ? [...f.tags].sort() : undefined,
      isFavorite: f.isFavorite ?? undefined,
      isLiked: f.isLiked ?? undefined,
      hasNoTags: f.hasNoTags ?? undefined,
      hasNoAuthor: f.hasNoAuthor ?? undefined,
    };
    return JSON.stringify(key);
  }, [currentFilter]);

  // Range loader using server autoTag search API
  const loadRange = useCallback(
    async (startIndex: number, endIndex: number) => {
      if (startIndex < 0) return;

      const offset = startIndex;
      const limit = Math.max(0, endIndex - startIndex + 1);
      if (limit === 0) return;

      const key = `${offset}-${endIndex}`;

      // If nothing to load (known empty), skip
      if (isEmptyRef.current) return;

      // If this exact range is already loading, skip
      if (loadingRangesRef.current.has(key)) return;

      // If items already loaded for this range, skip (use ref to avoid callback deps churn)
      const curItems = itemsRef.current;
      if (curItems.length > 0) {
        let loaded = true;
        for (let i = offset; i <= endIndex && i < curItems.length; i++) {
          if (curItems[i] === undefined) {
            loaded = false;
            break;
          }
        }
        if (loaded) return;
      }

      const epoch = epochRef.current;
      loadingRangesRef.current.add(key);
      setIsLoading(true);
      try {
        const res = await apiClient.searchStacksByAutoTag({
          datasetId,
          autoTag: decodedKey,
          limit,
          offset,
          search: currentFilter?.search?.trim() || undefined,
          filter: currentFilter,
        });

        // Ignore outdated responses
        if (epochRef.current !== epoch) {
          return;
        }

        // Initialize items array to the correct total length once known
        const totalFromServer = res.total || 0;
        setTotal(totalFromServer);
        if (totalFromServer === 0) {
          // Mark as empty to prevent repeated loads
          isEmptyRef.current = true;
          setItems([]);
          return;
        }
        setItems((prev) => {
          const totalLen = totalFromServer;
          const base =
            prev.length === totalLen && totalLen > 0
              ? [...prev]
              : new Array(totalLen).fill(undefined);
          res.stacks.forEach((s, idx) => {
            const i = offset + idx;
            if (i < base.length) {
              base[i] = {
                ...s,
                favorited: s.favorited ?? s.isFavorite,
                isFavorite: s.isFavorite ?? s.favorited,
              } as MediaGridItem;
            }
          });
          return base;
        });
      } finally {
        loadingRangesRef.current.delete(key);
        setIsLoading(false);
      }
    },
    [datasetId, decodedKey, currentFilter]
  );

  // initial prefetch of first page (guarded by loadRange)
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      if (navigationState && navigationState.lastPath === window.location.pathname) {
        const itemSize = 200;
        const itemsPerRow = 5;
        const scrollTop = navigationState.scrollPosition;
        const viewportHeight = window.innerHeight;
        const startRow = Math.floor(scrollTop / itemSize);
        const endRow = Math.ceil((scrollTop + viewportHeight) / itemSize);
        const bufferRows = 3;
        const startIndex = Math.max(0, (startRow - bufferRows) * itemsPerRow);
        const endIndex = Math.max(startIndex, (endRow + bufferRows) * itemsPerRow - 1);
        void (async () => {
          await loadRange(startIndex, endIndex);
          restoreScrollSafely(scrollTop);
          setNavigationState(null);
        })();
      } else {
        void loadRange(0, 49);
      }
    }
  }, [loadRange, navigationState, setNavigationState, restoreScrollSafely]);

  // Refetch when filters change
  useEffect(() => {
    epochRef.current += 1;
    setIsLoading(true);
    isEmptyRef.current = false;
    loadingRangesRef.current.clear();
    setItems([]);
    itemsRef.current = [];
    setTotal(0);
    void loadRange(0, 49);
  }, [filterKey, decodedKey, datasetId]);

  const handleItemClick = (item: MediaGridItem) => {
    setNavigationState({
      scrollPosition: window.scrollY,
      total,
      items,
      lastPath: window.location.pathname,
    });
    // Build ordered ids (right→left) from currently loaded items
    const loadedIdsLtr = (items || [])
      .filter((it): it is MediaGridItem => !!it)
      .map((it) =>
        typeof it.id === 'string' ? Number.parseInt(it.id as string, 10) : (it.id as number)
      );
    const ids = loadedIdsLtr.slice().reverse();
    const clickedId =
      typeof item.id === 'string' ? Number.parseInt(item.id as string, 10) : (item.id as number);
    const currentIndex = Math.max(
      0,
      ids.findIndex((id) => id === clickedId)
    );

    const mediaType = (item as any).mediaType as string | undefined;
    const token = genListToken({ datasetId, mediaType });
    saveViewContext({
      token,
      datasetId,
      mediaType: mediaType as any,
      ids,
      currentIndex,
      createdAt: Date.now(),
    });

    navigate({
      to: '/library/$datasetId/stacks/$stackId',
      params: { datasetId, stackId: String(item.id) },
      search: { page: 0, mediaType, listToken: token },
    });
  };

  return (
    <>
      <StackGrid
        items={items}
        total={total}
        hasMore={items.filter(Boolean).length < total}
        isLoading={isLoading}
        dataset={dataset}
        onLoadRange={loadRange}
        onItemClick={handleItemClick}
        emptyState={{
          icon: '✨',
          title: `No stacks for AutoTag "${decodedKey}"`,
          description: 'This AutoTag has not matched any stacks yet.',
        }}
      />
      <FilterPanel
        currentFilter={currentFilter as any}
        onFilterChange={(f) => setCurrentFilter({ ...f, datasetId })}
      />
    </>
  );
}
