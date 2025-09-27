import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { Eraser } from 'lucide-react';
import MersenneTwister from 'mersenne-twister';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FilterPanel from '@/components/FilterPanel';
import StackGrid from '@/components/StackGrid';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { useDataset } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { isScratchCollection, useScratch } from '@/hooks/useScratch';
import { apiClient } from '@/lib/api-client';
import { navigationStateAtom } from '@/stores/navigation';
import { currentFilterAtom } from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaGridItem, StackFilter } from '@/types';

export const Route = createFileRoute('/library/$datasetId/collections/$collectionId')({
  component: CollectionView,
});

function CollectionView() {
  console.log('CollectionView');

  const { datasetId, collectionId } = Route.useParams();
  const { data: dataset } = useDataset(datasetId);
  const navigate = useNavigate();
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [currentSort, setCurrentSort] = useState<{ field: string; order: 'asc' | 'desc' }>({
    field: 'recommended',
    order: 'desc',
  });

  // Fetch collection details
  const { data: collection, isLoading: isCollectionLoading } = useQuery({
    queryKey: ['collection', collectionId],
    queryFn: () => apiClient.getCollection(collectionId),
  });

  // Scratch 操作
  const { clearScratch, isClearing } = useScratch(datasetId);
  const [showClearDialog, setShowClearDialog] = useState(false);

  // Enable header actions for collection view
  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: true,
      showFilter: true,
      showSelection: true,
      showReorder: collection?.type === 'MANUAL',
    }),
    [collection?.type]
  );

  const mtRef = useRef<MersenneTwister | null>(null);
  if (!mtRef.current) mtRef.current = new MersenneTwister();

  const handleShuffle = useCallback(async () => {
    if (!collection) return;
    // Use unified stacks API with current filter (includes collectionId for MANUAL or restored filters for SMART)
    const countResp = await apiClient.getStacks({
      datasetId,
      filter: currentFilter,
      sort: currentSort,
      limit: 1,
      offset: 0,
    });
    const total = countResp.total || 0;
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
    const page = await apiClient.getStacks({
      datasetId,
      filter: currentFilter,
      sort: currentSort,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    });
    const item = page.stacks?.[withinPageIndex];
    if (!item) return;

    const ids = (page.stacks || [])
      .map((s) =>
        typeof s.id === 'string' ? Number.parseInt(s.id as string, 10) : (s.id as number)
      )
      .reverse();
    const clickedId =
      typeof item.id === 'string' ? Number.parseInt(item.id as string, 10) : (item.id as number);
    const currentIndex = Math.max(0, ids.indexOf(clickedId));
    const token = genListToken({
      datasetId,
      mediaType: (item as any).mediaType,
      filters: currentFilter,
      sort: currentSort,
      collectionId,
    });
    saveViewContext({
      token,
      datasetId,
      mediaType: (item as any).mediaType,
      filters: currentFilter,
      sort: currentSort,
      collectionId,
      ids,
      currentIndex,
      createdAt: Date.now(),
    });

    navigate({
      to: '/library/$datasetId/stacks/$stackId',
      params: { datasetId, stackId: String(item.id) },
      search: { page: 0, mediaType: (item as any).mediaType, listToken: token },
    });
  }, [collection, datasetId, currentFilter, currentSort, collectionId, navigate]);

  useHeaderActions({ ...headerActionsConfig, onShuffle: handleShuffle });
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

  // Set filters based on collection type
  useEffect(() => {
    if (collection) {
      if (collection.type === 'SMART' && collection.filterConfig) {
        // Restore filter config for smart collection
        const filterConfig = collection.filterConfig as any;
        const restoredFilter: StackFilter = {
          datasetId,
        };

        if (filterConfig.search) restoredFilter.search = filterConfig.search;
        if (filterConfig.favorited !== undefined)
          restoredFilter.isFavorite = filterConfig.favorited;
        if (filterConfig.liked !== undefined) restoredFilter.isLiked = filterConfig.liked;
        if (filterConfig.tagIds) restoredFilter.tags = filterConfig.tagIds;
        if (filterConfig.authorNames) restoredFilter.authors = filterConfig.authorNames;
        if (filterConfig.hasNoTags) restoredFilter.hasNoTags = filterConfig.hasNoTags;
        if (filterConfig.hasNoAuthor) restoredFilter.hasNoAuthor = filterConfig.hasNoAuthor;
        if (filterConfig.mediaType) restoredFilter.mediaType = filterConfig.mediaType;
        if (filterConfig.colorFilter) restoredFilter.colorFilter = filterConfig.colorFilter;

        setCurrentFilter(restoredFilter);
      } else {
        // Clear filters for manual collection
        setCurrentFilter({
          datasetId,
          collectionId,
        });
      }
    }
  }, [datasetId, collectionId, collection, setCurrentFilter]);

  // Check if filters have been modified from the original smart collection config
  const isFilterModified = useMemo(() => {
    if (!collection || collection.type !== 'SMART' || !collection.filterConfig) return false;

    const originalConfig = collection.filterConfig as any;

    // Compare current filter with original config
    return (
      currentFilter.search !== originalConfig.search ||
      currentFilter.isFavorite !== originalConfig.favorited ||
      currentFilter.isLiked !== originalConfig.liked ||
      JSON.stringify(currentFilter.tags) !== JSON.stringify(originalConfig.tagIds) ||
      JSON.stringify(currentFilter.authors) !== JSON.stringify(originalConfig.authorNames) ||
      currentFilter.hasNoTags !== originalConfig.hasNoTags ||
      currentFilter.hasNoAuthor !== originalConfig.hasNoAuthor ||
      currentFilter.mediaType !== originalConfig.mediaType ||
      JSON.stringify(currentFilter.colorFilter) !== JSON.stringify(originalConfig.colorFilter)
    );
  }, [collection, currentFilter]);

  // Fetch collection stacks based on collection type
  const {
    data: stacksData,
    isLoading: isStacksLoading,
    refetch: refetchStacks,
  } = useQuery({
    queryKey: [
      'collection-stacks',
      collectionId,
      currentFilter,
      currentSort,
      collection?.type,
      isFilterModified,
    ],
    queryFn: async () => {
      if (!collection) return { stacks: [], total: 0 };

      if (collection.type === 'SMART' && !isFilterModified) {
        // For smart collections with unmodified filters, use the smart collection endpoint
        const result = await apiClient.getSmartCollectionStacks(collection.id, {
          limit: 100,
          offset: 0,
        });
        return {
          stacks: result.stacks,
          total: result.total,
          limit: 100,
          offset: 0,
        };
      } else {
        // Manual collections or modified smart collections
        // Special-case: when sort is "recommended" for MANUAL, order by collection addition order
        if (collection.type === 'MANUAL' && currentSort.field === 'recommended') {
          // 1) Fetch filtered stacks without explicit sort (server filters by params)
          const filtered = await apiClient.getStacks({
            datasetId,
            filter: {
              datasetId,
              collectionId,
              mediaType: currentFilter.mediaType,
              tags: currentFilter.tags,
              authors: currentFilter.authors,
              isFavorite: currentFilter.isFavorite,
              isLiked: currentFilter.isLiked,
              search: currentFilter.search,
              hasNoTags: currentFilter.hasNoTags,
              hasNoAuthor: currentFilter.hasNoAuthor,
              colorFilter: currentFilter.colorFilter as any,
            },
            limit: 100,
            offset: 0,
          });

          // 2) Fetch collection order (orderIndex)
          const ordered = await apiClient.getCollectionStacks(collection.id, {
            limit: 100,
            offset: 0,
          });
          const orderMap = new Map<number, number>();
          ordered.forEach((it) => {
            const id =
              typeof it.stack.id === 'string'
                ? Number.parseInt(it.stack.id as string, 10)
                : (it.stack.id as number);
            orderMap.set(id, it.orderIndex);
          });

          // 3) Sort filtered stacks by orderIndex (desc => newest first)
          const stacks = (filtered.stacks || []).slice().sort((a, b) => {
            const aid =
              typeof a.id === 'string' ? Number.parseInt(a.id as string, 10) : (a.id as number);
            const bid =
              typeof b.id === 'string' ? Number.parseInt(b.id as string, 10) : (b.id as number);
            const ai = orderMap.get(aid) ?? 0;
            const bi = orderMap.get(bid) ?? 0;
            return currentSort.order === 'asc' ? ai - bi : bi - ai;
          });

          return { stacks, total: filtered.total, limit: 100, offset: 0 };
        }

        // Fallback: use unified API with explicit sort/order for non-recommended or SMART(modified)
        const filterParams: any = {
          dataSetId: Number.parseInt(datasetId, 10),
          limit: 100,
          offset: 0,
          sort: currentSort.field,
          order: currentSort.order,
        };

        if (collection.type === 'MANUAL') {
          filterParams.collection = Number.parseInt(collectionId, 10);
        }
        if (currentFilter.mediaType) filterParams.mediaType = currentFilter.mediaType;
        if (currentFilter.tags && currentFilter.tags.length > 0)
          filterParams.tag = currentFilter.tags;
        if (currentFilter.authors && currentFilter.authors.length > 0)
          filterParams.author = currentFilter.authors;
        if (currentFilter.isFavorite) filterParams.fav = 1;
        if (currentFilter.isLiked) filterParams.liked = 1;
        if (currentFilter.search) filterParams.search = currentFilter.search;
        if (currentFilter.hasNoTags !== undefined) filterParams.hasNoTags = currentFilter.hasNoTags;
        if (currentFilter.hasNoAuthor !== undefined)
          filterParams.hasNoAuthor = currentFilter.hasNoAuthor;
        if (currentFilter.colorFilter) {
          if (currentFilter.colorFilter.hueCategories?.length > 0)
            filterParams.hueCategories = currentFilter.colorFilter.hueCategories;
          if (currentFilter.colorFilter.toneSaturation !== undefined)
            filterParams.toneSaturation = currentFilter.colorFilter.toneSaturation;
          if (currentFilter.colorFilter.toneLightness !== undefined)
            filterParams.toneLightness = currentFilter.colorFilter.toneLightness;
          if (currentFilter.colorFilter.toneTolerance !== undefined)
            filterParams.toneTolerance = currentFilter.colorFilter.toneTolerance;
          if (currentFilter.colorFilter.similarityThreshold !== undefined)
            filterParams.similarityThreshold = currentFilter.colorFilter.similarityThreshold;
          if (currentFilter.colorFilter.customColor)
            filterParams.customColor = currentFilter.colorFilter.customColor;
        }

        return apiClient.getStacksWithFilters(filterParams);
      }
    },
    enabled: !!collection,
  });

  // Initialize filter with current dataset (don't include collectionId in filter)
  useEffect(() => {
    setCurrentFilter((prev) => ({
      ...prev,
      datasetId,
    }));
  }, [datasetId, setCurrentFilter]);

  // Memoize loaded items
  const stableLoadedItems = useMemo(() => {
    return (stacksData?.stacks || []) as unknown as MediaGridItem[];
  }, [stacksData?.stacks]);

  // Expose collection metadata for children (context menu gating, etc.)
  useEffect(() => {
    if (collection) {
      try {
        document.body.dataset.collectionType = collection.type;
        document.body.dataset.collectionId = String(collection.id);
      } catch {}
    }
    return () => {
      try {
        delete (document.body as any).dataset.collectionType;
        delete (document.body as any).dataset.collectionId;
      } catch {}
    };
  }, [collection]);

  // Restore scroll after stacks are loaded
  useEffect(() => {
    if (
      navigationState &&
      navigationState.lastPath === window.location.pathname &&
      !isStacksLoading
    ) {
      setTimeout(() => {
        restoreScrollSafely(navigationState.scrollPosition);
        setNavigationState(null);
      }, 0);
    }
  }, [navigationState, isStacksLoading, setNavigationState, restoreScrollSafely]);

  // Handle filter changes
  const handleFilterChange = useCallback(
    (newFilter: StackFilter) => {
      setCurrentFilter(newFilter);
    },
    [setCurrentFilter]
  );

  // Handle sort changes
  const handleSortChange = useCallback((newSort: { field: string; order: 'asc' | 'desc' }) => {
    setCurrentSort(newSort);
  }, []);

  // Handle item click - navigate to stack viewer
  const handleItemClick = (item: MediaGridItem) => {
    setNavigationState({
      scrollPosition: window.scrollY,
      total,
      items: stableLoadedItems,
      lastPath: window.location.pathname,
      filter: currentFilter,
      sort: currentSort,
    });
    console.log('Navigate to stack:', item.id);
    // Build ids from loaded stacks
    // StackViewerは右→左の順序で巡回するため、ID配列は反転させて保存する
    const loadedIdsLtr = (stableLoadedItems || []).map((it) =>
      typeof it.id === 'string' ? Number.parseInt(it.id, 10) : (it.id as number)
    );
    const loadedIds = loadedIdsLtr.slice().reverse();
    const clickedId =
      typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
    const currentIndex = Math.max(0, loadedIds.indexOf(clickedId));

    const token = genListToken({
      datasetId,
      mediaType: currentFilter.mediaType,
      filters: currentFilter,
      sort: currentSort,
      collectionId,
    });

    saveViewContext({
      token,
      datasetId,
      mediaType: currentFilter.mediaType as any,
      filters: currentFilter,
      sort: currentSort,
      collectionId,
      ids: loadedIds,
      currentIndex,
      createdAt: Date.now(),
    });

    navigate({
      to: '/library/$datasetId/stacks/$stackId',
      params: { datasetId, stackId: String(item.id) },
      search: {
        page: 0,
        from: 'collection',
        collectionId: Number.parseInt(collectionId, 10),
        listToken: token,
      },
    });
  };

  // Handle range loading (for future virtual scrolling)
  const handleLoadRange = useCallback((startIndex: number, endIndex: number) => {
    // For now, we load all items at once
    // Future enhancement: implement virtual scrolling for large collections
    console.log('Load range requested:', startIndex, endIndex);
  }, []);

  // Refresh all items
  const handleRefreshAll = useCallback(async () => {
    await refetchStacks();
  }, [refetchStacks]);

  // Handle reorder of stacks within collection
  const handleReorderStacks = useCallback(
    async (sourceIndex: number, destinationIndex: number) => {
      if (!collection || sourceIndex === destinationIndex) return;

      try {
        console.log(`🔄 Reordering item from index ${sourceIndex} to ${destinationIndex}`);

        // Create a copy of current items for UI optimization
        const reorderedItems = [...stableLoadedItems];
        const [movedItem] = reorderedItems.splice(sourceIndex, 1);
        reorderedItems.splice(destinationIndex, 0, movedItem);

        // Generate new order indices based on the reordered array
        const stackOrders = reorderedItems.map((item, index) => ({
          stackId: typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id,
          orderIndex: index,
        }));

        console.log('📋 Sending reorder data:', stackOrders.slice(0, 5), '...'); // Log first 5 items

        // Update the order on the server
        await apiClient.reorderStacksInCollection(collection.id, stackOrders);

        console.log('✅ Reorder completed successfully');

        // Refresh the data to reflect server state
        await refetchStacks();
      } catch (error) {
        console.error('❌ Failed to reorder stacks:', error);
        // Optionally show user notification here
      }
    },
    [collection, stableLoadedItems, refetchStacks]
  );

  const isLoading = isCollectionLoading || isStacksLoading;
  const total = stacksData?.total || 0;

  // Determine empty state based on collection type
  const getEmptyState = () => {
    if (collection?.type === 'SMART') {
      return {
        icon: '🔍',
        title: 'No items match the smart collection criteria',
        description: 'This collection automatically includes items based on saved filters.',
      };
    }

    return {
      icon: '📁',
      title: `No items in "${collection?.name || 'this collection'}"`,
      description: 'Drag and drop stacks here to add them to this collection.',
    };
  };

  return (
    <>
      {/* Scratch: 右上に Clear ボタン */}
      {isScratchCollection(collection as any) &&
        createPortal(
          <HeaderIconButton aria-label="Clear Scratch" onClick={() => setShowClearDialog(true)}>
            <Eraser size={18} />
          </HeaderIconButton>,
          document.getElementById('header-actions') || document.body
        )}

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">Clear Scratch</DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Remove all items from Scratch? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={() => setShowClearDialog(false)}
              disabled={isClearing}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!collection) return;
                await clearScratch(collection.id);
                // 即時に一覧を更新
                try {
                  await refetchStacks();
                } catch {}
                setShowClearDialog(false);
              }}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : 'Clear'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <StackGrid
        items={stableLoadedItems}
        total={total}
        hasMore={false} // For now, load all items at once
        isLoading={isLoading}
        error={null}
        dataset={dataset}
        onItemClick={handleItemClick}
        onLoadRange={handleLoadRange}
        onRefreshAll={handleRefreshAll}
        onReorderStacks={handleReorderStacks}
        emptyState={getEmptyState()}
        allowRemoveFromCollection={collection?.type === 'MANUAL'}
      />
      <FilterPanel
        currentFilter={currentFilter}
        currentSort={currentSort}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
        isSmartCollection={collection?.type === 'SMART'}
        collectionId={collection?.id}
        originalFilterConfig={collection?.filterConfig}
        isFilterModified={isFilterModified}
      />
    </>
  );
}
