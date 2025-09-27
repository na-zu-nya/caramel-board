import FilterPanel from '@/components/FilterPanel';
import StackGrid from '@/components/StackGrid';
import { useDataset } from '@/hooks/useDatasets';
import { genListToken, saveViewContext } from '@/stores/view-context';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { useRangeBasedQuery } from '@/hooks/useRangeBasedQuery';
import { currentFilterAtom } from '@/stores/ui';
import type { MediaGridItem, StackFilter } from '@/types';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { navigationStateAtom } from '@/stores/navigation';

export const Route = createFileRoute('/library/$datasetId/tag/$tagName')({
  component: TagDetailPage,
});

function TagDetailPage() {
  const { datasetId, tagName } = Route.useParams();
  const { data: dataset } = useDataset(datasetId);
  const navigate = useNavigate();
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [currentSort, setCurrentSort] = useState<{ field: string; order: 'asc' | 'desc' }>({
    field: 'recommended',
    order: 'desc',
  });

  // Decode tag name from URL (二重エンコード対策)
  const decodedTagName = useMemo(() => {
    try {
      const once = decodeURIComponent(tagName);
      return once.includes('%') ? decodeURIComponent(once) : once;
    } catch {
      return tagName;
    }
  }, [tagName]);

  // Enable header actions
  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: true,
      showFilter: true,
      showSelection: true,
    }),
    []
  );

  useHeaderActions(headerActionsConfig);
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

  // このページではベースとしてタグ条件を強制しつつ、他のフィルタも併用可能にする
  const tagFilter = useMemo<StackFilter>(
    () => ({ datasetId, tags: [decodedTagName] }),
    [datasetId, decodedTagName]
  );
  useEffect(() => {
    setCurrentFilter(tagFilter);
  }, [tagFilter, setCurrentFilter]);

  const effectiveFilter: StackFilter = useMemo(
    () => ({
      ...currentFilter,
      datasetId,
      tags: [decodedTagName],
    }),
    [currentFilter, datasetId, decodedTagName]
  );

  // Range-based query for virtual scrolling
  const {
    total,
    allItems,
    loadRange,
    getItemsInRange,
    isRangeLoaded,
    isLoading,
    loadedPages,
    refreshAll,
  } = useRangeBasedQuery({
    datasetId,
    filter: effectiveFilter,
    sort: currentSort,
    pageSize: 50,
  });

  // Load initial items when total is available and no pages are loaded
  useEffect(() => {
    if (total > 0 && loadedPages.size === 0) {
      if (navigationState && navigationState.lastPath === window.location.pathname) {
        const itemSize = 200;
        const itemsPerRow = 5;
        const scrollTop = navigationState.scrollPosition;
        const viewportHeight = window.innerHeight;
        const startRow = Math.floor(scrollTop / itemSize);
        const endRow = Math.ceil((scrollTop + viewportHeight) / itemSize);
        const bufferRows = 3;
        const startIndex = Math.max(0, (startRow - bufferRows) * itemsPerRow);
        const endIndex = Math.min((endRow + bufferRows) * itemsPerRow - 1, total - 1);
        void (async () => {
          await loadRange(startIndex, endIndex);
          restoreScrollSafely(scrollTop);
          setNavigationState(null);
        })();
      } else {
        void loadRange(0, Math.min(49, total - 1));
      }
    }
  }, [
    total,
    loadedPages.size,
    loadRange,
    navigationState,
    setNavigationState,
    restoreScrollSafely,
  ]);

  // Memoize loaded items to prevent unnecessary recalculations
  const stableLoadedItems = useMemo(() => {
    const items = allItems.filter((item) => item !== undefined) as MediaGridItem[];
    return items;
  }, [allItems]);

  // Handle filter changes - preserve tag filter
  const handleFilterChange = useCallback(
    (newFilter: StackFilter) => {
      // タグ条件と datasetId は常に固定
      setCurrentFilter({ ...newFilter, datasetId, tags: [decodedTagName] });
    },
    [datasetId, decodedTagName, setCurrentFilter]
  );

  // Handle sort changes
  const handleSortChange = useCallback((newSort: { field: string; order: 'asc' | 'desc' }) => {
    setCurrentSort(newSort);
  }, []);

  // Load specific range of items
  const handleLoadRange = useCallback(
    (startIndex: number, endIndex: number) => {
      if (startIndex < total && endIndex < total) {
        void loadRange(startIndex, endIndex);
      }
    },
    [total, loadRange]
  );

  const handleItemClick = (item: MediaGridItem) => {
    setNavigationState({
      scrollPosition: window.scrollY,
      total,
      items: allItems,
      lastPath: window.location.pathname,
      filter: effectiveFilter,
      sort: currentSort,
    });
    // Build ordered ids (right-to-left) from loaded items
    const loadedIdsLtr = (allItems || [])
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
    const token = genListToken({ datasetId, mediaType, filters: effectiveFilter });
    saveViewContext({
      token,
      datasetId,
      mediaType: mediaType as any,
      filters: effectiveFilter,
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
        items={stableLoadedItems}
        total={total}
        hasMore={stableLoadedItems.length < total}
        isLoading={isLoading}
        error={null}
        dataset={dataset}
        onItemClick={handleItemClick}
        onLoadRange={handleLoadRange}
        onRefreshAll={refreshAll}
        emptyState={{
          icon: '🏷️',
          title: `No items tagged with "${decodedTagName}"`,
          description: 'This tag has not been applied to any items yet.',
        }}
      />
      <FilterPanel
        currentFilter={currentFilter}
        currentSort={currentSort}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
      />
    </>
  );
}
