import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import MersenneTwister from 'mersenne-twister';
import { useCallback, useEffect, useRef, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import StackGrid from '@/components/StackGrid';
import { useDataset } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { useRangeBasedQuery } from '@/hooks/useRangeBasedQuery';
import { navigationStateAtom } from '@/stores/navigation';
import { currentFilterAtom } from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaGridItem, MediaType, StackFilter } from '@/types';

export const Route = createFileRoute('/library/$datasetId/media-type/$mediaType')({
  component: MediaTypeList,
});

function MediaTypeList() {
  const { datasetId, mediaType } = Route.useParams();
  const search = Route.useSearch() as {
    tags?: string[];
    sparse?: boolean;
    search?: string;
    isFavorite?: boolean;
    isLiked?: boolean;
    authors?: string[];
    hasNoTags?: boolean;
    hasNoAuthor?: boolean;
    colorFilter?: string;
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
      console.log('📌 Preserving filter state from navigation');
      return;
    }

    // Otherwise, initialize from URL params
    const newFilter: StackFilter = {
      datasetId,
      mediaType: mediaType as MediaType,
      // Preserve explicit false/empty values correctly; avoid `|| undefined` which drops false
      tags: search.tags ?? undefined,
      search: search.search ?? undefined,
      isFavorite: search.isFavorite ?? undefined,
      isLiked: search.isLiked ?? undefined,
      authors: search.authors ?? undefined,
      hasNoTags: search.hasNoTags ?? undefined,
      hasNoAuthor: search.hasNoAuthor ?? undefined,
      colorFilter: search.colorFilter ? JSON.parse(search.colorFilter) : undefined,
    };
    setCurrentFilter(newFilter);
  }, [
    datasetId,
    mediaType,
    search.tags,
    search.search,
    search.isFavorite,
    search.isLiked,
    search.authors,
    search.hasNoTags,
    search.hasNoAuthor,
    search.colorFilter,
    setCurrentFilter,
    navigationState,
  ]);

  // Range-based query for virtual scrolling
  const { total, allItems, loadPage, loadRange, isLoading, loadedPages, refreshAll } =
    useRangeBasedQuery({
      datasetId,
      mediaType,
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

      // Build a local ids window from the fetched page (right→left order)
      const ids = (page?.stacks || [])
        .map((s) => (typeof s.id === 'string' ? Number.parseInt(s.id, 10) : (s.id as number)))
        .reverse();
      const token = genListToken({
        datasetId,
        mediaType,
        filters: currentFilter,
        sort: currentSort,
      });
      const clickedId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
      const currentIndex = Math.max(0, ids.indexOf(clickedId));
      saveViewContext({
        token,
        datasetId,
        mediaType: mediaType as any,
        filters: currentFilter,
        sort: currentSort,
        ids,
        currentIndex,
        createdAt: Date.now(),
      });

      // Preserve search params + listToken
      const searchParams: Record<string, string | string[] | number | boolean> = {
        page: 0,
        mediaType,
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
    mediaType,
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
  });

  // Restore navigation state if coming back from stack viewer
  useEffect(() => {
    // We treat presence of navigationState for this path as "returning"
    if (navigationState && navigationState.lastPath === window.location.pathname) {
      console.log('📌 Restoring navigation state');

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

        console.log(`📌 Loading previously visible range: ${startIndex}-${endIndex}`);
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
      setCurrentFilter(newFilter);
      // Clear navigation state on filter change
      setNavigationState(null);

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
      if (newFilter.colorFilter) {
        searchParams.colorFilter = JSON.stringify(newFilter.colorFilter);
      }

      void navigate({
        to: '/library/$datasetId/media-type/$mediaType',
        params: { datasetId, mediaType },
        search: searchParams,
        replace: true,
      });
    },
    [setCurrentFilter, setNavigationState, navigate, datasetId, mediaType]
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

  const handleItemClick = useCallback(
    (item: MediaGridItem) => {
      console.log('Navigate to stack:', item.id);

      // Save current state before navigation
      setNavigationState({
        scrollPosition: window.scrollY,
        total,
        items: allItems,
        lastPath: window.location.pathname,
        filter: currentFilter,
        sort: currentSort,
      });

      // Build ViewContext ids window from currently loaded items
      // StackViewerは右→左の順序を厳守するため、
      // ビュー文脈のID配列は右から左へ進む並びにする。
      // ここではグリッドの読み込み順（左→右）から反転させる。
      const loadedIdsLtr = (allItems || [])
        .filter((it): it is MediaGridItem => !!it)
        .map((it) => (typeof it.id === 'string' ? Number.parseInt(it.id, 10) : (it.id as number)));
      const loadedIds = loadedIdsLtr.slice().reverse();
      const clickedId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
      const currentIndex = Math.max(0, loadedIds.indexOf(clickedId));

      // Create a listToken and persist ViewContext
      const token = genListToken({
        datasetId,
        mediaType,
        filters: currentFilter,
        sort: currentSort,
      });
      saveViewContext({
        token,
        datasetId,
        mediaType: mediaType as any,
        filters: currentFilter,
        sort: currentSort,
        ids: loadedIds,
        currentIndex,
        createdAt: Date.now(),
      });

      // Navigate to stack viewer - preserve all search params + listToken
      const searchParams: Record<string, string | string[] | number | boolean> = {
        page: 0,
        mediaType,
        listToken: token,
      };

      // Copy over search params, handling booleans
      if (search.tags) searchParams.tags = search.tags;
      if (search.sparse !== undefined) searchParams.sparse = search.sparse;
      if (search.search) searchParams.search = search.search;
      if (search.isFavorite !== undefined) searchParams.isFavorite = search.isFavorite;
      if (search.isLiked !== undefined) searchParams.isLiked = search.isLiked;
      if (search.authors) searchParams.authors = search.authors;
      if (search.hasNoTags !== undefined) searchParams.hasNoTags = search.hasNoTags;
      if (search.hasNoAuthor !== undefined) searchParams.hasNoAuthor = search.hasNoAuthor;
      if (search.colorFilter) searchParams.colorFilter = search.colorFilter;

      // Preserve current filter in search params (override search params if different)
      if (currentFilter.tags && currentFilter.tags.length > 0) {
        searchParams.tags = currentFilter.tags;
      }
      if (currentFilter.search) {
        searchParams.search = currentFilter.search;
      }
      if (currentFilter.isFavorite !== undefined) {
        searchParams.isFavorite = currentFilter.isFavorite;
      }
      if (currentFilter.isLiked !== undefined) {
        searchParams.isLiked = currentFilter.isLiked;
      }
      if (currentFilter.authors && currentFilter.authors.length > 0) {
        searchParams.authors = currentFilter.authors;
      }
      if (currentFilter.hasNoTags !== undefined) {
        searchParams.hasNoTags = currentFilter.hasNoTags;
      }
      if (currentFilter.hasNoAuthor !== undefined) {
        searchParams.hasNoAuthor = currentFilter.hasNoAuthor;
      }
      if (currentFilter.colorFilter) {
        searchParams.colorFilter = JSON.stringify(currentFilter.colorFilter);
      }

      void navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId, stackId: String(item.id) },
        search: searchParams,
      });
    },
    [
      navigate,
      datasetId,
      mediaType,
      search,
      setNavigationState,
      total,
      allItems,
      currentFilter,
      currentSort,
    ]
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
        onItemClick={handleItemClick}
        containerRef={containerRef}
        useWindowScroll
        emptyState={{
          icon: '🖼️',
          title: 'No images found in this dataset.',
          description: 'Try uploading some images to get started.',
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
