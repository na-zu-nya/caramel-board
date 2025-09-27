import FilterPanel from '@/components/FilterPanel';
import StackGrid from '@/components/StackGrid';
import { useDataset } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import MersenneTwister from 'mersenne-twister';
import { apiClient } from '@/lib/api-client';
import { currentFilterAtom } from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaGridItem, StackFilter } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const Route = createFileRoute('/library/$datasetId/scratch/$scratchId')({
  component: ScratchView,
});

function ScratchView() {
  const { datasetId, scratchId } = Route.useParams();
  const collectionId = scratchId; // reuse collection-based logic
  const { data: dataset } = useDataset(datasetId);
  const navigate = useNavigate();
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [currentSort, setCurrentSort] = useState<{ field: string; order: 'asc' | 'desc' }>({
    field: 'recommended',
    order: 'desc',
  });

  // Fetch collection details
  const { data: collection, isLoading: isCollectionLoading } = useQuery({
    queryKey: ['scratch-collection', collectionId],
    queryFn: () => apiClient.getCollection(collectionId),
  });

  // Expose collection metadata for menus (type/id) like Collections page
  useEffect(() => {
    try {
      (document.body as any).dataset.collectionType = 'SCRATCH';
      (document.body as any).dataset.collectionId = String(collectionId);
    } catch {}
    return () => {
      try {
        delete (document.body as any).dataset.collectionType;
        delete (document.body as any).dataset.collectionId;
      } catch {}
    };
  }, [collectionId]);

  // Header actions (like collection view)
  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: true,
      showFilter: true,
      showSelection: true,
      showReorder: collection?.type === 'MANUAL',
    }),
    [collection?.type]
  );
  useHeaderActions(headerActionsConfig);

  const mtRef = useRef<MersenneTwister | null>(null);
  if (!mtRef.current) mtRef.current = new MersenneTwister();

  // Prepare filter: scratch behaves like manual collection filter
  useEffect(() => {
    setCurrentFilter({ datasetId, collectionId });
  }, [datasetId, collectionId, setCurrentFilter]);

  const { data: stacksData, isLoading: isStacksLoading, refetch: refetchStacks } = useQuery({
    queryKey: ['scratch-stacks', collectionId, currentSort, currentFilter],
    queryFn: async () => {
      // Special-case: when sort is "recommended", order by collection addition order
      if (currentSort.field === 'recommended') {
        // 1) Fetch filtered stacks without explicit sort
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

        // 2) Fetch collection order
        const ordered = await apiClient.getCollectionStacks(collectionId, { limit: 100, offset: 0 });
        const orderMap = new Map<number, number>();
        ordered.forEach((it) => {
          const id = typeof it.stack.id === 'string' ? parseInt(it.stack.id as string, 10) : (it.stack.id as number);
          orderMap.set(id, it.orderIndex);
        });

        // 3) Sort filtered stacks by orderIndex (desc => newest first)
        const stacks = (filtered.stacks || []).slice().sort((a, b) => {
          const aid = typeof a.id === 'string' ? parseInt(a.id as string, 10) : (a.id as number);
          const bid = typeof b.id === 'string' ? parseInt(b.id as string, 10) : (b.id as number);
          const ai = orderMap.get(aid) ?? 0;
          const bi = orderMap.get(bid) ?? 0;
          return currentSort.order === 'asc' ? ai - bi : bi - ai;
        });

        return { stacks, total: filtered.total, limit: 100, offset: 0 };
      }

      // Otherwise, use unified API with explicit sort
      const qp: any = {
        dataSetId: Number(datasetId),
        collection: Number(collectionId),
        limit: 100,
        offset: 0,
        sort: currentSort.field,
        order: currentSort.order,
      };
      if (currentFilter.mediaType) qp.mediaType = currentFilter.mediaType;
      if (currentFilter.tags && currentFilter.tags.length > 0) qp.tag = currentFilter.tags;
      if (currentFilter.authors && currentFilter.authors.length > 0) qp.author = currentFilter.authors;
      if (currentFilter.isFavorite) qp.fav = 1;
      if (currentFilter.isLiked) qp.liked = 1;
      if (currentFilter.search) qp.search = currentFilter.search;
      if (currentFilter.hasNoTags !== undefined) qp.hasNoTags = currentFilter.hasNoTags;
      if (currentFilter.hasNoAuthor !== undefined) qp.hasNoAuthor = currentFilter.hasNoAuthor;
      if (currentFilter.colorFilter) {
        const cf = currentFilter.colorFilter;
        if (cf.hueCategories?.length) qp.hueCategories = cf.hueCategories;
        if (cf.toneSaturation !== undefined) qp.toneSaturation = cf.toneSaturation;
        if (cf.toneLightness !== undefined) qp.toneLightness = cf.toneLightness;
        if (cf.toneTolerance !== undefined) qp.toneTolerance = cf.toneTolerance;
        if (cf.similarityThreshold !== undefined) qp.similarityThreshold = cf.similarityThreshold;
        if (cf.customColor) qp.customColor = cf.customColor;
      }
      return apiClient.getStacksWithFilters(qp);
    },
    enabled: !!collectionId,
  });

  // Listen to external clear events from sidebar menu to refresh immediately
  useEffect(() => {
    const handler = (e: any) => {
      const clearedId = e?.detail?.id;
      if (String(clearedId) === String(collectionId)) {
        void refetchStacks();
      }
    };
    window.addEventListener('scratch-cleared', handler as EventListener);
    return () => window.removeEventListener('scratch-cleared', handler as EventListener);
  }, [collectionId, refetchStacks]);

  // Shuffle action (same as collection)
  const handleShuffle = useCallback(async () => {
    const countResp = await apiClient.getStacks({ datasetId, filter: { datasetId, collectionId }, sort: currentSort, limit: 1, offset: 0 });
    const total = countResp.total || 0;
    if (total <= 0) return;
    const PAGE_SIZE = 50;
    const MAX = 0x100000000;
    const bound = MAX - (MAX % total);
    let r: number;
    do { r = mtRef.current!.random_int(); } while (r >= bound);
    const targetIndex = r % total;
    const pageIndex = Math.floor(targetIndex / PAGE_SIZE);
    const withinPageIndex = targetIndex % PAGE_SIZE;
    const page = await apiClient.getStacks({ datasetId, filter: { datasetId, collectionId }, sort: currentSort, limit: PAGE_SIZE, offset: pageIndex * PAGE_SIZE });
    const item = page.stacks?.[withinPageIndex];
    if (!item) return;

    const ids = (page.stacks || []).map((s) => (typeof s.id === 'string' ? Number.parseInt(s.id as string, 10) : (s.id as number))).reverse();
    const clickedId = typeof item.id === 'string' ? Number.parseInt(item.id as string, 10) : (item.id as number);
    const currentIndex = Math.max(0, ids.findIndex((id) => id === clickedId));
    const token = genListToken({ datasetId, mediaType: (item as any).mediaType, filters: { datasetId, collectionId }, sort: currentSort, collectionId });
    saveViewContext({ token, datasetId, mediaType: (item as any).mediaType, filters: { datasetId, collectionId } as any, sort: currentSort as any, collectionId, ids, currentIndex, createdAt: Date.now() });

    navigate({ to: '/library/$datasetId/stacks/$stackId', params: { datasetId, stackId: String(item.id) }, search: { page: 0, mediaType: (item as any).mediaType, listToken: token } });
  }, [datasetId, collectionId, currentSort, navigate]);

  const items: MediaGridItem[] = useMemo(() => {
    const list = (stacksData?.stacks || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail || s.thumbnailUrl,
      thumbnailUrl: s.thumbnailUrl || s.thumbnail,
      favorited: s.favorited || s.isFavorite,
      isFavorite: s.isFavorite || s.favorited,
      likeCount: Number(s.likeCount ?? s.liked ?? 0),
    }));
    return list;
  }, [stacksData]);

  const handleItemClick = useCallback((item: MediaGridItem) => {
    const loadedIdsLtr = (items || []).map((it) => Number(it.id));
    const loadedIds = loadedIdsLtr.slice().reverse();
    const clickedId = typeof item.id === 'string' ? Number.parseInt(item.id as string, 10) : (item.id as number);
    const currentIndex = Math.max(0, loadedIds.findIndex((id) => id === clickedId));
    const token = genListToken({ datasetId, mediaType: (item as any).mediaType, filters: { datasetId, collectionId }, sort: currentSort, collectionId });
    saveViewContext({ token, datasetId, mediaType: (item as any).mediaType, filters: { datasetId, collectionId } as any, sort: currentSort as any, collectionId, ids: loadedIds, currentIndex, createdAt: Date.now() });
    navigate({ to: '/library/$datasetId/stacks/$stackId', params: { datasetId, stackId: String(item.id) }, search: { page: 0, listToken: token } });
  }, [items, datasetId, collectionId, currentSort, navigate]);

  const isLoading = isCollectionLoading || isStacksLoading;
  const total = stacksData?.total || 0;

  return (
    <>
      <StackGrid
        items={items}
        total={total}
        hasMore={false}
        isLoading={isLoading}
        error={null}
        dataset={dataset}
        onItemClick={handleItemClick}
        onLoadRange={() => {}}
        onRefreshAll={async () => { await refetchStacks(); }}
        onReorderStacks={undefined}
        emptyState={{ icon: '📂', title: 'No items in "Scratch"', description: 'Drag and drop stacks here to collect them temporarily.' }}
        allowRemoveFromScratch
        scratchCollectionId={collectionId}
      />
      <FilterPanel
        currentFilter={currentFilter}
        currentSort={currentSort}
        onFilterChange={setCurrentFilter}
        onSortChange={setCurrentSort}
        isSmartCollection={false}
        collectionId={Number(collectionId)}
        originalFilterConfig={undefined}
        isFilterModified={false}
      />
    </>
  );
}
