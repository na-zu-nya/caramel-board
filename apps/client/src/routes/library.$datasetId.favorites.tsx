import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import MersenneTwister from 'mersenne-twister';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import StackGrid from '@/components/StackGrid';
import { useDataset } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { apiClient } from '@/lib/api-client';
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

  // フィルタ漏れ防止: 常に最小構成にリセット
  // 現在のフィルタにお気に入り条件を付与（フリーワード等と併用）
  useEffect(() => {
    // Reset filter on entering this top list (unless returning from viewer which is handled by navigationState elsewhere)
    setCurrentFilter({ datasetId, isFavorite: true });
  }, [datasetId, setCurrentFilter]);

  const {
    data: favoriteItems,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['favorite-items', datasetId],
    queryFn: () => apiClient.getFavoriteItems({ datasetId, limit: 500, offset: 0 }),
  });

  const stableLoadedItems = useMemo(() => {
    const items = favoriteItems?.stacks ?? [];
    const search = currentFilter.search?.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (currentFilter.mediaType && item.mediaType !== currentFilter.mediaType) return false;
      if (
        search &&
        !String(item.name ?? '')
          .toLowerCase()
          .includes(search)
      )
        return false;
      return true;
    }) as MediaGridItem[];

    return filtered.sort((left, right) => {
      const direction = currentSort.order === 'asc' ? 1 : -1;
      switch (currentSort.field) {
        case 'name':
          return direction * String(left.name ?? '').localeCompare(String(right.name ?? ''));
        case 'likes':
          return (
            direction *
            (Number(left.likeCount ?? left.liked ?? 0) -
              Number(right.likeCount ?? right.liked ?? 0))
          );
        case 'updated':
          return (
            direction *
            (new Date(String(left.updatedAt ?? 0)).getTime() -
              new Date(String(right.updatedAt ?? 0)).getTime())
          );
        default:
          return (
            direction *
            (new Date(String(left.favoriteCreatedAt ?? left.createdAt ?? 0)).getTime() -
              new Date(String(right.favoriteCreatedAt ?? right.createdAt ?? 0)).getTime())
          );
      }
    });
  }, [currentFilter.mediaType, currentFilter.search, currentSort, favoriteItems?.stacks]);

  const total = stableLoadedItems.length;
  const allItems = stableLoadedItems;
  const refreshAll = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // RNG for shuffle（useRangeBasedQuery 後に定義）
  const mtRef = useRef<MersenneTwister | null>(null);
  if (!mtRef.current) mtRef.current = new MersenneTwister();

  // Shuffle across all favorites
  const handleShuffle = useCallback(async () => {
    if (total <= 0) return;
    const MAX = 0x100000000;
    const bound = MAX - (MAX % total);
    let r: number;
    do {
      r = mtRef.current!.random_int();
    } while (r >= bound);
    const targetIndex = r % total;
    const item = allItems[targetIndex];
    if (!item) return;

    const ids = Array.from(
      new Set(
        allItems
          .map((s) => s.stackId ?? s.id)
          .map((id) => (typeof id === 'string' ? Number.parseInt(id, 10) : id))
          .filter((id): id is number => Number.isFinite(id))
      )
    ).reverse();
    const itemStackId = item.stackId ?? item.id;
    const clickedId =
      typeof itemStackId === 'string' ? Number.parseInt(itemStackId, 10) : itemStackId;
    const currentIndex = Math.max(0, ids.indexOf(clickedId));
    const token = genListToken({
      datasetId,
      mediaType: item.mediaType,
      filters: { ...currentFilter, datasetId, isFavorite: true },
      sort: currentSort,
    });
    saveViewContext({
      token,
      datasetId,
      mediaType: item.mediaType,
      filters: { ...currentFilter, datasetId, isFavorite: true },
      sort: currentSort,
      ids,
      currentIndex,
      createdAt: Date.now(),
    });

    navigate({
      to: '/library/$datasetId/stacks/$stackId',
      params: { datasetId, stackId: String(clickedId) },
      search: {
        page: typeof item.favoritePage === 'number' ? item.favoritePage - 1 : 0,
        mediaType: item.mediaType,
        listToken: token,
      },
    });
  }, [total, allItems, datasetId, currentFilter, currentSort, navigate]);

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

  useEffect(() => {
    if (navigationState && navigationState.lastPath === window.location.pathname) {
      restoreScrollSafely(navigationState.scrollPosition);
      setNavigationState(null);
    }
  }, [navigationState, restoreScrollSafely, setNavigationState]);

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
    const loadedIdsLtr = Array.from(
      new Set(
        (allItems || [])
          .filter((it): it is MediaGridItem => !!it)
          .map((it) => it.stackId ?? it.id)
          .map((id) => (typeof id === 'string' ? Number.parseInt(id, 10) : id))
          .filter((id): id is number => Number.isFinite(id))
      )
    );
    const ids = loadedIdsLtr.slice().reverse();
    const itemStackId = item.stackId ?? item.id;
    const clickedId =
      typeof itemStackId === 'string' ? Number.parseInt(itemStackId, 10) : itemStackId;
    const currentIndex = Math.max(0, ids.indexOf(clickedId));

    // ViewContext を保存（お気に入りフィルタ固定）
    const mediaType = item.mediaType;
    const token = genListToken({
      datasetId,
      mediaType,
      filters: { ...currentFilter, datasetId, isFavorite: true },
      sort: currentSort,
    });
    saveViewContext({
      token,
      datasetId,
      mediaType,
      filters: { ...currentFilter, datasetId, isFavorite: true },
      sort: currentSort,
      ids,
      currentIndex,
      createdAt: Date.now(),
    });

    // StackViewer へ（listToken と mediaType を付与）
    navigate({
      to: '/library/$datasetId/stacks/$stackId',
      params: { datasetId, stackId: String(clickedId) },
      search: {
        page: typeof item.favoritePage === 'number' ? item.favoritePage - 1 : 0,
        mediaType,
        listToken: token,
      },
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
