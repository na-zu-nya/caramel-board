import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import StackGrid from '@/components/StackGrid';
import { useDataset } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { useRangeBasedQuery } from '@/hooks/useRangeBasedQuery';
import { navigationStateAtom } from '@/stores/navigation';
import { currentFilterAtom } from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaGridItem, StackFilter } from '@/types';

export const Route = createFileRoute('/library/$datasetId/author/$authorName')({
  component: AuthorDetailPage,
});

function AuthorDetailPage() {
  const { datasetId, authorName } = Route.useParams();
  const { data: dataset } = useDataset(datasetId);
  const navigate = useNavigate();
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [currentSort, setCurrentSort] = useState<{ field: string; order: 'asc' | 'desc' }>({
    field: 'recommended',
    order: 'desc',
  });

  // Decode author name from URL (handle double-encoded cases)
  const decodedAuthorName = useMemo(() => {
    try {
      const once = decodeURIComponent(authorName);
      return once.includes('%') ? decodeURIComponent(once) : once;
    } catch {
      return authorName;
    }
  }, [authorName]);

  // Enable header actions
  const headerActionsConfig = useMemo(
    () => ({ showShuffle: true, showFilter: true, showSelection: true }),
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

  // Fix filter to author only (prevent leaking extra conditions)
  const authorFilter = useMemo<StackFilter>(
    () => ({ datasetId, authors: [decodedAuthorName] }),
    [datasetId, decodedAuthorName]
  );

  useEffect(() => {
    setCurrentFilter(authorFilter);
  }, [authorFilter, setCurrentFilter]);

  // 現在のフィルタに著者条件を強制付与して検索（フリーワード等を併用可能に）
  const effectiveFilter: StackFilter = useMemo(
    () => ({
      ...currentFilter,
      datasetId,
      authors: [decodedAuthorName],
    }),
    [currentFilter, datasetId, decodedAuthorName]
  );

  // Range-based query for virtual scrolling
  const { total, allItems, loadRange, isLoading, loadedPages, refreshAll } = useRangeBasedQuery({
    datasetId,
    filter: effectiveFilter,
    sort: currentSort,
    pageSize: 50,
  });

  // Load first page when ready
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

  const stableLoadedItems = useMemo(() => {
    return allItems.filter(Boolean) as MediaGridItem[];
  }, [allItems]);

  const handleFilterChange = useCallback(
    (newFilter: StackFilter) =>
      setCurrentFilter({ ...newFilter, datasetId, authors: [decodedAuthorName] }),
    [datasetId, decodedAuthorName, setCurrentFilter]
  );

  const handleSortChange = useCallback((newSort: { field: string; order: 'asc' | 'desc' }) => {
    setCurrentSort(newSort);
  }, []);

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
    // Cross-asset navigation: build ids from loaded items (right-to-left)
    const loadedIdsLtr = (allItems || [])
      .filter((it): it is MediaGridItem => !!it)
      .map((it) =>
        typeof it.id === 'string' ? Number.parseInt(it.id as string, 10) : (it.id as number)
      );
    const ids = loadedIdsLtr.slice().reverse();
    const clickedId =
      typeof item.id === 'string' ? Number.parseInt(item.id as string, 10) : (item.id as number);
    const currentIndex = Math.max(0, ids.indexOf(clickedId));

    const mediaType = (item as any).mediaType as string | undefined;
    const token = genListToken({ datasetId, mediaType, filters: authorFilter });
    saveViewContext({
      token,
      datasetId,
      mediaType: mediaType as any,
      filters: authorFilter,
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
          icon: '👤',
          title: `No items by "${decodedAuthorName}"`,
          description: 'No stacks found for this author.',
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
