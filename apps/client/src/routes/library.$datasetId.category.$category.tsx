import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import MersenneTwister from 'mersenne-twister';
import { useCallback, useEffect, useRef, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import StackGrid from '@/components/StackGrid';
import StackViewer from '@/components/stack-viewer/StackViewer';
import { useDataset } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { useRangeBasedQuery } from '@/hooks/useRangeBasedQuery';
import { useT } from '@/lib/i18n';
import { areStackFiltersEqual } from '@/lib/stack-filter';
import {
  shouldReplaceViewerHistory,
  type ViewerStackNavigationOptions,
} from '@/lib/viewer-stack-navigation';
import { navigationStateAtom } from '@/stores/navigation';
import { currentFilterAtom } from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaCategory, MediaGridItem, StackFilter } from '@/types';

export const Route = createFileRoute('/library/$datasetId/category/$category')({
  component: MediaTypeList,
});

function MediaTypeList() {
  const t = useT();
  const { datasetId, category } = Route.useParams();
  const search = Route.useSearch() as {
    tags?: string[];
    sparse?: boolean;
    search?: string;
    isFavorite?: boolean;
    isLiked?: boolean;
    authors?: string[];
    hasNoTags?: boolean;
    hasNoAuthor?: boolean;
    mediaTypes?: StackFilter['mediaTypes'];
    colorFilter?: string;
    imageSearch?: string;
    viewer?: string;
    listToken?: string;
    page?: number;
  };
  const { data: dataset } = useDataset(datasetId);
  const navigate = useNavigate();
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [currentSort, setCurrentSort] = useState<{ field: string; order: 'asc' | 'desc' }>({
    field: 'recommended',
    order: 'desc',
  });
  const [navigationState, setNavigationState] = useAtom(navigationStateAtom);
  const containerRef = useRef<HTMLDivElement>(null);

  // Robust scroll restoration helper
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

  // MT RNG instance (stable per mount)
  const mtRef = useRef<MersenneTwister | null>(null);
  if (!mtRef.current) mtRef.current = new MersenneTwister();

  // Initialize filters from URL params only when not returning from navigation
  useEffect(() => {
    // If we're returning from stack viewer (nav state exists for this path), preserve the filter
    if (navigationState && navigationState.lastPath === window.location.pathname) {
      return;
    }

    // Otherwise, initialize from URL params
    const newFilter: StackFilter = {
      datasetId,
      category: category as MediaCategory,
      mediaTypes: search.mediaTypes,
      // Preserve explicit false/empty values correctly; avoid `|| undefined` which drops false
      tags: search.tags ?? undefined,
      search: search.search ?? undefined,
      isFavorite: search.isFavorite ?? undefined,
      isLiked: search.isLiked ?? undefined,
      authors: search.authors ?? undefined,
      hasNoTags: search.hasNoTags ?? undefined,
      hasNoAuthor: search.hasNoAuthor ?? undefined,
      colorFilter: search.colorFilter ? JSON.parse(search.colorFilter) : undefined,
      imageSearch: search.imageSearch ? JSON.parse(search.imageSearch) : undefined,
    };
    setCurrentFilter((previousFilter) =>
      areStackFiltersEqual(previousFilter, newFilter) ? previousFilter : newFilter
    );
  }, [
    datasetId,
    category,
    search.tags,
    search.search,
    search.isFavorite,
    search.isLiked,
    search.authors,
    search.hasNoTags,
    search.hasNoAuthor,
    search.mediaTypes,
    search.colorFilter,
    search.imageSearch,
    setCurrentFilter,
    navigationState,
  ]);

  // Range-based query for virtual scrolling
  const { total, allItems, loadPage, loadRange, isLoading, loadedPages, refreshAll } =
    useRangeBasedQuery({
      datasetId,
      category,
      filter: currentFilter,
      sort: currentSort,
      pageSize: 50,
    });

  // Shuffle navigate across the full list (ignoring pagination)
  const handleShuffle = useCallback(async () => {
    try {
      if (total <= 0) return;
      const PAGE_SIZE = 50;
      const rng = mtRef.current!;
      // Unbiased integer in [0, total)
      const MAX = 0x100000000;
      const bound = MAX - (MAX % total);
      let r = 0;
      do {
        r = rng.random_int();
      } while (r >= bound);
      const targetIndex = r % total;
      const pageIndex = Math.floor(targetIndex / PAGE_SIZE);
      const withinPageIndex = targetIndex % PAGE_SIZE;
      const page = await loadPage(pageIndex);
      const item = page?.stacks?.[withinPageIndex] ?? allItems[targetIndex];
      if (!item) return;

      // Build a local ids window in the same order as the grid list.
      const ids = (page?.stacks || []).map((s) =>
        typeof s.id === 'string' ? Number.parseInt(s.id, 10) : (s.id as number)
      );
      const token = genListToken({
        datasetId,
        category,
        filters: currentFilter,
        sort: currentSort,
      });
      const clickedId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
      const currentIndex = Math.max(0, ids.indexOf(clickedId));
      saveViewContext({
        token,
        datasetId,
        category: category as MediaCategory,
        filters: currentFilter,
        sort: currentSort,
        ids,
        currentIndex,
        createdAt: Date.now(),
      });

      // Preserve search params + listToken
      const searchParams: Record<string, string | string[] | number | boolean> = {
        page: 0,
        category,
        listToken: token,
      };
      if (search.tags) searchParams.tags = search.tags;
      if (search.sparse !== undefined) searchParams.sparse = search.sparse;
      if (search.search) searchParams.search = search.search;
      if (search.isFavorite !== undefined) searchParams.isFavorite = search.isFavorite;
      if (search.isLiked !== undefined) searchParams.isLiked = search.isLiked;
      if (search.authors) searchParams.authors = search.authors;
      if (search.hasNoTags !== undefined) searchParams.hasNoTags = search.hasNoTags;
      if (search.hasNoAuthor !== undefined) searchParams.hasNoAuthor = search.hasNoAuthor;
      if (search.colorFilter) searchParams.colorFilter = search.colorFilter;
      if (search.imageSearch) searchParams.imageSearch = search.imageSearch;

      // Navigate
      void navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId, stackId: String(item.id) },
        search: searchParams,
      });
    } catch (e) {
      console.error('Shuffle navigation failed:', e);
    }
  }, [
    total,
    datasetId,
    category,
    navigate,
    currentFilter,
    currentSort,
    search,
    allItems,
    loadPage,
  ]);

  useHeaderActions({
    showShuffle: true,
    showFilter: true,
    showSelection: true,
    onShuffle: handleShuffle,
    enabled: !search.viewer,
  });

  // Restore navigation state if coming back from stack viewer
  useEffect(() => {
    // We treat presence of navigationState for this path as "returning"
    if (navigationState && navigationState.lastPath === window.location.pathname) {
      // Restore filter and sort state
      if (navigationState.filter) {
        setCurrentFilter(navigationState.filter);
      }
      if (navigationState.sort) {
        setCurrentSort(navigationState.sort);
      }

      // Preload the visible range then restore scroll
      const itemSize = 200;
      const itemsPerRow = 5;
      const scrollTop = navigationState.scrollPosition;
      const viewportHeight = window.innerHeight;
      const startRow = Math.floor(scrollTop / itemSize);
      const endRow = Math.ceil((scrollTop + viewportHeight) / itemSize);
      const bufferRows = 3;
      const startIndex = Math.max(0, (startRow - bufferRows) * itemsPerRow);
      const endIndex = Math.max(
        startIndex,
        Math.min((endRow + bufferRows) * itemsPerRow - 1, Math.max(0, (total || 1) - 1))
      );

      setTimeout(() => {
        void (async () => {
          await loadRange(startIndex, endIndex);
          restoreScrollSafely(scrollTop);
          // Clear after restoration to avoid re-running on subsequent mounts
          setNavigationState(null);
        })();
      }, 0);
    }
  }, [
    navigationState,
    setCurrentFilter,
    setNavigationState,
    restoreScrollSafely,
    loadRange,
    total,
  ]);

  // Load initial items when total is available and no pages are loaded
  useEffect(() => {
    if (total > 0 && loadedPages.size === 0) {
      // If we have navigation state for this path, load the visible range
      if (navigationState && navigationState.lastPath === window.location.pathname) {
        // Calculate which items were visible based on scroll position
        const itemSize = 200; // Approximate item height
        const itemsPerRow = 5;
        const scrollTop = navigationState.scrollPosition;
        const viewportHeight = window.innerHeight;

        // Calculate visible row range
        const startRow = Math.floor(scrollTop / itemSize);
        const endRow = Math.ceil((scrollTop + viewportHeight) / itemSize);

        // Add buffer and convert to item indices
        const bufferRows = 3;
        const startIndex = Math.max(0, (startRow - bufferRows) * itemsPerRow);
        const endIndex = Math.min((endRow + bufferRows) * itemsPerRow - 1, total - 1);

        void (async () => {
          await loadRange(startIndex, endIndex);
          // After range is loaded, ensure final restoration
          restoreScrollSafely(scrollTop);
        })();
      } else {
        // Load initial page
        void (async () => {
          await loadRange(0, Math.min(49, total - 1));
        })();
      }
    }
  }, [total, loadedPages.size, loadRange, navigationState, restoreScrollSafely]);

  // Handle filter changes
  const handleFilterChange = useCallback(
    (newFilter: StackFilter) => {
      setCurrentFilter((previousFilter) =>
        areStackFiltersEqual(previousFilter, newFilter) ? previousFilter : newFilter
      );
      // Clear navigation state on filter change
      setNavigationState((previousState) => (previousState === null ? previousState : null));

      // Update URL with new filter params
      const searchParams: Record<string, any> = {};
      if (newFilter.tags && newFilter.tags.length > 0) {
        searchParams.tags = newFilter.tags;
      }
      if (newFilter.search) {
        searchParams.search = newFilter.search;
      }
      if (newFilter.isFavorite !== undefined) {
        searchParams.isFavorite = newFilter.isFavorite;
      }
      if (newFilter.isLiked !== undefined) {
        searchParams.isLiked = newFilter.isLiked;
      }
      if (newFilter.authors && newFilter.authors.length > 0) {
        searchParams.authors = newFilter.authors;
      }
      if (newFilter.hasNoTags !== undefined) {
        searchParams.hasNoTags = newFilter.hasNoTags;
      }
      if (newFilter.hasNoAuthor !== undefined) {
        searchParams.hasNoAuthor = newFilter.hasNoAuthor;
      }
      if (newFilter.mediaTypes?.length) {
        searchParams.mediaTypes = newFilter.mediaTypes;
      }
      if (newFilter.colorFilter) {
        searchParams.colorFilter = JSON.stringify(newFilter.colorFilter);
      }
      if (newFilter.imageSearch) {
        searchParams.imageSearch = JSON.stringify(newFilter.imageSearch);
      }

      void navigate({
        to: '/library/$datasetId/category/$category',
        params: { datasetId, category },
        search: searchParams,
        replace: true,
      });
    },
    [setCurrentFilter, setNavigationState, navigate, datasetId, category]
  );

  // Handle sort changes
  const handleSortChange = useCallback(
    (newSort: { field: string; order: 'asc' | 'desc' }) => {
      setCurrentSort(newSort);
      // Clear navigation state on sort change
      setNavigationState(null);
    },
    [setNavigationState]
  );

  // Load specific range of items
  const handleLoadRange = useCallback(
    (startIndex: number, endIndex: number) => {
      if (startIndex < total && endIndex < total) {
        void loadRange(startIndex, endIndex);
      }
    },
    [total, loadRange]
  );

  // ハンドラの同一性を保つための最新値ミラー。search 依存の useCallback にすると
  // viewer パラメータの付け外しのたびに全タイルの memo が無効化され、
  // 開閉コミットが重くなる（タップ応答の遅延・サムネ再描画の原因）
  const searchRef = useRef(search);
  searchRef.current = search;
  const allItemsRef = useRef(allItems);
  allItemsRef.current = allItems;
  const currentFilterRef = useRef(currentFilter);
  currentFilterRef.current = currentFilter;
  const currentSortRef = useRef(currentSort);
  currentSortRef.current = currentSort;

  const handleItemClick = useCallback(
    (item: MediaGridItem) => {
      // Note: navigationState is intentionally NOT saved here. The list stays mounted
      // (viewer is rendered as an overlay via the `viewer` search param), so there is
      // nothing to restore, and saving it would incorrectly trigger the restore effect.
      const latestFilter = currentFilterRef.current;
      const latestSort = currentSortRef.current;

      // Build ViewContext ids window from currently loaded items in grid-list order.
      const loadedIds = (allItemsRef.current || [])
        .filter((it): it is MediaGridItem => !!it)
        .map((it) => (typeof it.id === 'string' ? Number.parseInt(it.id, 10) : (it.id as number)));
      const clickedId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
      const currentIndex = Math.max(0, loadedIds.indexOf(clickedId));

      // Create a listToken and persist ViewContext
      const token = genListToken({
        datasetId,
        category,
        filters: latestFilter,
        sort: latestSort,
      });
      saveViewContext({
        token,
        datasetId,
        category: category as MediaCategory,
        filters: latestFilter,
        sort: latestSort,
        ids: loadedIds,
        currentIndex,
        createdAt: Date.now(),
      });

      // Open the viewer as an overlay on top of this same route, keeping the list mounted.
      // resetScroll: false — 開閉でリストのスクロール位置を動かさない
      void navigate({
        to: '/library/$datasetId/category/$category',
        params: { datasetId, category },
        search: { ...searchRef.current, viewer: String(item.id), listToken: token },
        resetScroll: false,
      });
    },
    [navigate, datasetId, category]
  );

  const handleViewerClose = useCallback(() => {
    const { viewer: _viewer, ...rest } = searchRef.current;
    void navigate({
      to: '/library/$datasetId/category/$category',
      params: { datasetId, category },
      search: rest,
      replace: true,
      resetScroll: false,
    });
  }, [navigate, datasetId, category]);

  const handleViewerNavigateStack = useCallback(
    (stackId: string, options?: ViewerStackNavigationOptions) => {
      return navigate({
        to: '/library/$datasetId/category/$category',
        params: { datasetId, category },
        search: { ...searchRef.current, viewer: stackId },
        replace: shouldReplaceViewerHistory(options),
        resetScroll: false,
      });
    },
    [navigate, datasetId, category]
  );

  return (
    <>
      <StackGrid
        items={allItems}
        total={total}
        hasMore={loadedPages.size * 50 < total}
        isLoading={isLoading}
        error={null}
        onLoadRange={handleLoadRange}
        onRefreshAll={refreshAll}
        dataset={dataset}
        uploadMediaCategory={category as MediaCategory}
        onItemClick={handleItemClick}
        containerRef={containerRef}
        useWindowScroll
        hideChrome={Boolean(search.viewer)}
        emptyState={{
          icon: '🖼️',
          title: t.emptyState.noImages,
          description: t.emptyState.uploadImagesDescription,
        }}
      />
      {!search.viewer && (
        <FilterPanel
          currentFilter={currentFilter}
          currentSort={currentSort}
          onFilterChange={handleFilterChange}
          onSortChange={handleSortChange}
        />
      )}
      {search.viewer && (
        // z-30: タイル上のバッジ(z-10/z-20)より上、InfoSidebar(z-40)より下に重ねる
        <div className="relative z-30">
          <StackViewer
            datasetId={datasetId}
            category={category}
            stackId={search.viewer}
            listToken={search.listToken}
            onRequestClose={handleViewerClose}
            onNavigateStack={handleViewerNavigateStack}
          />
        </div>
      )}
    </>
  );
}
