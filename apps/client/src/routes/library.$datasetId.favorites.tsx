import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import MersenneTwister from 'mersenne-twister';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import StackGrid from '@/components/StackGrid';
import { useDataset } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { useRangeBasedQuery } from '@/hooks/useRangeBasedQuery';
import { navigationStateAtom } from '@/stores/navigation';
import { currentFilterAtom } from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaGridItem, StackFilter } from '@/types';

export const Route = createFileRoute('/library/$datasetId/favorites')({
  component: FavoritesPage,
});

function FavoritesPage() {
  const { datasetId } = Route.useParams();
  const { data: dataset } = useDataset(datasetId);
  const navigate = useNavigate();
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [currentSort, setCurrentSort] = useState<{ field: string; order: 'asc' | 'desc' }>({
    field: 'recommended',
    order: 'desc',
  });

  // Enable header actions
  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: true,
      showFilter: true,
      showSelection: true,
    }),
    []
  );

  // useRangeBasedQuery は shuffle で参照する total/loadPage/allItems を先に初期化

  // フィルタ漏れ防止: 常に最小構成にリセット
  // 現在のフィルタにお気に入り条件を付与（フリーワード等と併用）
  useEffect(() => {
    // Reset filter on entering this top list (unless returning from viewer which is handled by navigationState elsewhere)
    setCurrentFilter({ datasetId, isFavorite: true });
  }, [datasetId, setCurrentFilter]);

  // Range-based query for virtual scrolling
  const {
    total,
    allItems,
    loadPage,
    loadRange,
    getItemsInRange,
    isRangeLoaded,
    isLoading,
    loadedPages,
    refreshAll,
  } = useRangeBasedQuery({
    datasetId,
    filter: { ...currentFilter, datasetId, isFavorite: true },
    sort: currentSort,
    pageSize: 50,
  });

  // RNG for shuffle（useRangeBasedQuery 後に定義）
  const mtRef = useRef<MersenneTwister | null>(null);
  if (!mtRef.current) mtRef.current = new MersenneTwister();

  // Shuffle across all favorites
  const handleShuffle = useCallback(async () => {
    if (total <= 0) return;
    const PAGE_SIZE = 50;
    const MAX = 0x100000000;
    const bound = MAX - (MAX % total);
    let r: number;
    do {
      r = mtRef.current!.random_int();
    } while (r >= bound);
    const targetIndex = r % total;
    const pageIndex = Math.floor(targetIndex / PAGE_SIZE);
    const withinPageIndex = targetIndex % PAGE_SIZE;
    const page = await loadPage(pageIndex);
    const item = page?.stacks?.[withinPageIndex] || allItems[targetIndex];
    if (!item) return;

    const ids = (page?.stacks || [])
      .map((s) =>
        typeof s.id === 'string' ? Number.parseInt(s.id as string, 10) : (s.id as number)
      )
      .reverse();
    const clickedId =
      typeof item.id === 'string' ? Number.parseInt(item.id as string, 10) : (item.id as number);
    const currentIndex = Math.max(
      0,
      ids.findIndex((id) => id === clickedId)
    );
    const token = genListToken({
      datasetId,
      mediaType: (item as any).mediaType,
      filters: { ...currentFilter, datasetId, isFavorite: true },
      sort: currentSort,
    });
    saveViewContext({
      token,
      datasetId,
      mediaType: (item as any).mediaType,
      filters: { ...currentFilter, datasetId, isFavorite: true } as any,
      sort: currentSort,
      ids,
      currentIndex,
      createdAt: Date.now(),
    });

    navigate({
      to: '/library/$datasetId/stacks/$stackId',
      params: { datasetId, stackId: String(item.id) },
      search: { page: 0, mediaType: (item as any).mediaType, listToken: token },
    });
  }, [total, allItems, datasetId, currentFilter, currentSort, navigate, loadPage]);

  useHeaderActions({ ...headerActionsConfig, onShuffle: handleShuffle });

  // Scroll restoration state
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

  // Load initial items when total is available and no pages are loaded
  useEffect(() => {
    if (total > 0 && loadedPages.size === 0) {
      // If returning, prefetch visible range then restore
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
  }, [total, loadedPages.size, loadRange]);

  // Memoize loaded items to prevent unnecessary recalculations
  const stableLoadedItems = useMemo(() => {
    const items = allItems.filter((item) => item !== undefined) as MediaGridItem[];
    return items;
  }, [allItems]);

  // Handle filter changes
  const handleFilterChange = useCallback(
    (newFilter: StackFilter) => {
      setCurrentFilter({ ...newFilter, datasetId, isFavorite: true });
    },
    [setCurrentFilter, datasetId]
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
    // Save scroll position for restoration
    setNavigationState({
      scrollPosition: window.scrollY,
      total,
      items: allItems,
      lastPath: window.location.pathname,
      filter: { ...currentFilter, datasetId, isFavorite: true },
      sort: currentSort,
    });
    // 現在ロード済みのウィンドウから右→左順のID配列を構築
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

    // ViewContext を保存（お気に入りフィルタ固定）
    const mediaType = (item as any).mediaType as string | undefined;
    const token = genListToken({
      datasetId,
      mediaType,
      filters: { ...currentFilter, datasetId, isFavorite: true },
      sort: currentSort,
    });
    saveViewContext({
      token,
      datasetId,
      mediaType: mediaType as any,
      filters: { ...currentFilter, datasetId, isFavorite: true },
      sort: currentSort,
      ids,
      currentIndex,
      createdAt: Date.now(),
    });

    // StackViewer へ（listToken と mediaType を付与）
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
          icon: '⭐',
          title: 'No favorite items yet',
          description: 'Mark items as favorites to see them here.',
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
