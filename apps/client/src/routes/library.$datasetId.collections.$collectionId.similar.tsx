import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { Info } from 'lucide-react';
import MersenneTwister from 'mersenne-twister';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BulkEditPanel, { type EditUpdates } from '@/components/BulkEditPanel';
import InfoSidebar from '@/components/InfoSidebar';
import { StackTileGrid } from '@/components/StackTileGrid';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useSelectionMode } from '@/hooks/features/useSelectionMode';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { useStackTile } from '@/hooks/useStackTile';
import { apiClient } from '@/lib/api-client';
import { downloadStackOriginals } from '@/lib/download-originals';
import { useT } from '@/lib/i18n';
import { getSelectedMediaGridStackIds } from '@/lib/media-grid-selection';
import { createStackSelectionActions } from '@/lib/stack-selection-actions';
import {
  currentFilterAtom,
  infoSidebarOpenAtom,
  selectedItemIdAtom,
  selectionModeAtom,
} from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaGridItem, StackFilter, StackPaginatedResponse } from '@/types';

export const Route = createFileRoute('/library/$datasetId/collections/$collectionId/similar')({
  component: CollectionSimilarRoute,
});

const toStackId = (id: string | number): number | null => {
  const numericId = typeof id === 'string' ? Number.parseInt(id, 10) : id;
  return Number.isFinite(numericId) ? numericId : null;
};

const getRandomIndex = (rng: MersenneTwister, total: number) => {
  const max = 0x100000000;
  const bound = max - (max % total);
  let value = 0;
  do {
    value = rng.random_int();
  } while (value >= bound);
  return value % total;
};

const getStringTags = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const tags: string[] = [];
  for (const tag of value) {
    if (typeof tag === 'string') {
      tags.push(tag);
    }
  }
  return tags;
};

function CollectionSimilarRoute() {
  const t = useT();
  const { datasetId, collectionId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { onOpen, onInfo, onFindSimilar, onAddToScratch, onDownload, onLike, dragProps } =
    useStackTile(datasetId);
  const [limit] = useState(50);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [_currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const [selectedItemId, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const mtRef = useRef<MersenneTwister | null>(null);
  if (!mtRef.current) mtRef.current = new MersenneTwister();
  const {
    selectedItems,
    selectedItemOrder,
    isEditPanelOpen,
    setIsEditPanelOpen,
    toggleItemSelection,
    selectItemRange,
    clearSelection,
    exitSelectionMode,
  } = useSelectionMode(selectionMode);

  const { data: collection } = useQuery({
    queryKey: ['collection', collectionId],
    queryFn: () => apiClient.getCollection(collectionId),
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['collection-similar-stacks', datasetId, collectionId, limit],
    queryFn: () =>
      apiClient.getCollectionSimilarStacks({
        datasetId,
        collectionId,
        limit,
        offset: 0,
      }),
    staleTime: 30_000,
  });

  const items = useMemo<MediaGridItem[]>(
    () => (data?.stacks ?? []).map((stack) => ({ ...stack, stackId: stack.stackId ?? stack.id })),
    [data]
  );

  useEffect(() => {
    const filter: StackFilter = {
      datasetId,
      collectionId,
    };
    setCurrentFilter(filter);
  }, [collectionId, datasetId, setCurrentFilter]);

  const selectedStackIdsInOrder = useMemo(() => {
    return getSelectedMediaGridStackIds(selectedItemOrder, items);
  }, [items, selectedItemOrder]);

  const navigateToItem = useCallback(
    (item: MediaGridItem) => {
      const ids = items
        .map((loadedItem) => toStackId(loadedItem.id))
        .filter((id): id is number => id !== null)
        .reverse();
      const clickedId = toStackId(item.id);
      if (clickedId === null) return;
      const currentIndex = Math.max(0, ids.indexOf(clickedId));
      const mediaType = item.mediaType;
      const filters: StackFilter = { datasetId, collectionId };
      const token = genListToken({
        datasetId,
        mediaType,
        filters,
        collectionId,
      });

      saveViewContext({
        token,
        datasetId,
        mediaType,
        filters,
        collectionId,
        ids,
        currentIndex,
        createdAt: Date.now(),
      });

      navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId, stackId: String(item.id) },
        search: { page: 0, mediaType, listToken: token },
      });
    },
    [collectionId, datasetId, items, navigate]
  );

  const handleShuffle = useCallback(() => {
    if (items.length === 0 || !mtRef.current) return;
    const targetIndex = getRandomIndex(mtRef.current, items.length);
    const item = items[targetIndex];
    if (!item) return;
    navigateToItem(item);
  }, [items, navigateToItem]);

  useHeaderActions({
    showShuffle: true,
    showFilter: false,
    showSelection: true,
    onShuffle: handleShuffle,
  });

  const handleItemClick = useCallback(
    (item: MediaGridItem, event?: React.MouseEvent) => {
      event?.preventDefault();
      if (infoSidebarOpen) {
        setSelectedItemId(item.id);
        return;
      }

      navigateToItem(item);
    },
    [infoSidebarOpen, setSelectedItemId, navigateToItem]
  );

  const handleToggleSelection = useCallback(
    (itemId: string | number) => {
      if (!selectionMode) {
        setSelectionMode(true);
      }
      toggleItemSelection(itemId);
    },
    [selectionMode, setSelectionMode, toggleItemSelection]
  );

  const handleEnterSelectionMode = useCallback(
    (itemId: string | number) => {
      setSelectionMode(true);
      clearSelection();
      toggleItemSelection(itemId);
    },
    [clearSelection, setSelectionMode, toggleItemSelection]
  );

  const handleSelectRange = useCallback(
    (itemIds: Array<string | number>) => {
      selectItemRange(itemIds);
    },
    [selectItemRange]
  );

  const similarQueryKey = useMemo(
    () => ['collection-similar-stacks', datasetId, collectionId, limit] as const,
    [collectionId, datasetId, limit]
  );

  const patchSimilarFavorite = useCallback(
    (itemId: string | number, favorited: boolean) => {
      queryClient.setQueryData<StackPaginatedResponse>(similarQueryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          stacks: current.stacks.map((stack) =>
            String(stack.id) === String(itemId)
              ? { ...stack, favorited, isFavorite: favorited }
              : stack
          ),
        };
      });
    },
    [queryClient, similarQueryKey]
  );

  const onToggleFavorite = useCallback(
    async (item: MediaGridItem) => {
      const currentFavorited = Boolean(item.favorited ?? item.isFavorite);
      const nextFavorited = !currentFavorited;
      const itemId = item.id;
      patchSimilarFavorite(itemId, nextFavorited);

      try {
        await apiClient.toggleStackFavorite(itemId, nextFavorited);
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: similarQueryKey }),
          queryClient.invalidateQueries({ queryKey: ['favorite-items', datasetId] }),
          queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
        ]);
      } catch (error) {
        patchSimilarFavorite(itemId, currentFavorited);
        console.error('Failed to toggle favorite', error);
      }
    },
    [datasetId, patchSimilarFavorite, queryClient, similarQueryKey]
  );

  const applyEditUpdates = useCallback(
    async (updates: EditUpdates) => {
      if (selectedItems.size === 0) return;
      const stackIds = selectedStackIdsInOrder;
      if (stackIds.length === 0) return;

      try {
        if (updates.addTags && updates.addTags.length > 0) {
          await apiClient.bulkAddTags(stackIds, updates.addTags);
        }
        if (updates.setAuthor) {
          await apiClient.bulkSetAuthor(stackIds, updates.setAuthor);
        }
        if (updates.setMediaType) {
          await apiClient.bulkSetMediaType(stackIds, updates.setMediaType);
        }
        clearSelection();
        exitSelectionMode();
        await refetch();
      } catch (error) {
        console.error('Error applying bulk updates:', error);
      }
    },
    [selectedItems.size, selectedStackIdsInOrder, clearSelection, exitSelectionMode, refetch]
  );

  const refreshThumbnails = useCallback(async (stackIds: Array<string | number>) => {
    if (stackIds.length === 0) return;
    await apiClient.bulkRefreshThumbnails(stackIds);
  }, []);

  const handleRefreshThumbnails = useCallback(async () => {
    if (selectedItems.size === 0) return;
    const stackIds = selectedStackIdsInOrder;
    if (stackIds.length === 0) return;

    try {
      await refreshThumbnails(stackIds);
      exitSelectionMode();
      await refetch();
    } catch (error) {
      console.error('Error refreshing thumbnails:', error);
    }
  }, [selectedItems.size, selectedStackIdsInOrder, refreshThumbnails, exitSelectionMode, refetch]);

  const removeStacks = useCallback(async (stackIds: Array<string | number>) => {
    if (stackIds.length === 0) return;
    await apiClient.bulkRemoveStacks(stackIds);
  }, []);

  const handleRemoveStacks = useCallback(async () => {
    if (selectedItems.size === 0) return;
    const stackIds = selectedStackIdsInOrder;
    if (stackIds.length === 0) return;

    try {
      await removeStacks(stackIds);
      exitSelectionMode();
      await refetch();
    } catch (error) {
      console.error('Error removing stacks:', error);
    }
  }, [selectedItems.size, selectedStackIdsInOrder, removeStacks, exitSelectionMode, refetch]);

  const handleOptimizePreviews = useCallback(async () => {
    if (selectedItems.size === 0) return;

    const stackIds = selectedStackIdsInOrder;
    if (stackIds.length === 0) return;

    try {
      for (const id of stackIds) {
        await apiClient.regenerateStackPreview({ stackId: id, datasetId, force: true });
      }

      exitSelectionMode();
      await refetch();
    } catch (error) {
      console.error('Error optimizing video previews:', error);
      alert(t.grid.optimizeVideoFailed);
    }
  }, [selectedItems.size, selectedStackIdsInOrder, datasetId, exitSelectionMode, refetch, t]);

  const handleMergeStacks = useCallback(async () => {
    if (selectedStackIdsInOrder.length < 2) return;

    const [targetId, ...sourceIds] = selectedStackIdsInOrder;

    try {
      await apiClient.mergeStacks(targetId, sourceIds);
      exitSelectionMode();
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['stack'] }),
        queryClient.invalidateQueries({ queryKey: ['stacks'] }),
        queryClient.invalidateQueries({
          queryKey: ['collection-similar-stacks', datasetId, collectionId, limit],
        }),
        queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
        queryClient.invalidateQueries({ queryKey: ['likes', 'yearly'] }),
        queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] }),
      ]);
      await refetch();
    } catch (error) {
      console.error('Error merging stacks:', error);
      alert(t.grid.mergeStacksFailed);
    }
  }, [
    selectedStackIdsInOrder,
    exitSelectionMode,
    queryClient,
    datasetId,
    collectionId,
    limit,
    refetch,
    t,
  ]);

  const handleDownloadSelectedStacks = useCallback(() => {
    if (selectedStackIdsInOrder.length === 0) return;
    downloadStackOriginals(datasetId, selectedStackIdsInOrder);
  }, [datasetId, selectedStackIdsInOrder]);

  const handleMergeSelectedStacks = useCallback(async () => {
    if (selectedStackIdsInOrder.length < 2) return;
    const confirmed = window.confirm(
      t.grid.mergeSelectedConfirm(selectedStackIdsInOrder[0], selectedStackIdsInOrder.length - 1)
    );
    if (!confirmed) return;
    await handleMergeStacks();
  }, [handleMergeStacks, selectedStackIdsInOrder, t]);

  const getStackLinkElement = useCallback(
    (item: MediaGridItem) => (
      <Link
        to="/library/$datasetId/stacks/$stackId"
        params={{ datasetId, stackId: String(item.id) }}
      />
    ),
    [datasetId]
  );

  const handleOpenStack = useCallback(
    async (item: MediaGridItem) => {
      await onOpen(item.id);
    },
    [onOpen]
  );

  const handleInfoStack = useCallback(
    (item: MediaGridItem) => {
      onInfo(item.id);
    },
    [onInfo]
  );

  const handleFindSimilarStack = useCallback(
    async (item: MediaGridItem) => {
      await onFindSimilar(item.id);
    },
    [onFindSimilar]
  );

  const handleAddToScratchStack = useCallback(
    async (item: MediaGridItem) => {
      await onAddToScratch(item.id);
    },
    [onAddToScratch]
  );

  const handleDownloadStack = useCallback(
    (item: MediaGridItem) => {
      onDownload(item.id);
    },
    [onDownload]
  );

  const handleLikeStack = useCallback(
    async (item: MediaGridItem) => {
      await onLike(item.id);
    },
    [onLike]
  );

  const getStackDragHandlers = useCallback(
    (item: MediaGridItem, sourceImageUrl: string | null, sourceImageFilename: string | undefined) =>
      dragProps(item.id, sourceImageUrl, sourceImageFilename),
    [dragProps]
  );

  const toggleEditPanel = useCallback(() => {
    if (selectedItems.size === 0) return;
    setIsEditPanelOpen((open) => !open);
  }, [selectedItems.size, setIsEditPanelOpen]);

  const selectedEditableItems = useMemo(
    () =>
      items
        .filter((item) => selectedItems.has(item.id))
        .map((item) => ({
          id: item.id,
          tags: getStringTags(item.tags),
          author: typeof item.author === 'string' ? item.author : undefined,
        })),
    [items, selectedItems]
  );

  const selectionActions = useMemo(
    () =>
      createStackSelectionActions({
        selectedCount: selectedItems.size,
        copy: {
          bulkEdit: t.grid.bulkEdit,
          downloadSelected: t.contextMenu.downloadSelected,
          mergeStacks: t.grid.mergeStacks,
          refreshThumbnails: t.grid.refreshThumbnails,
          optimizeVideo: t.grid.optimizeVideo,
          deleteStacks: t.grid.deleteStacks,
          deleteStacksConfirm: t.grid.deleteStacksConfirm,
        },
        bulkEdit: { onSelect: toggleEditPanel },
        downloadSelected: { onSelect: handleDownloadSelectedStacks },
        mergeStacks:
          selectedStackIdsInOrder.length >= 2
            ? {
                onSelect: handleMergeStacks,
                confirmMessage: t.grid.mergeSelectedConfirm(
                  selectedStackIdsInOrder[0],
                  selectedStackIdsInOrder.length - 1
                ),
              }
            : undefined,
        refreshThumbnails: { onSelect: handleRefreshThumbnails },
        optimizeVideo: { onSelect: handleOptimizePreviews },
        deleteStacks: { onSelect: handleRemoveStacks },
      }),
    [
      handleDownloadSelectedStacks,
      handleMergeStacks,
      handleOptimizePreviews,
      handleRefreshThumbnails,
      handleRemoveStacks,
      selectedItems.size,
      selectedStackIdsInOrder,
      t,
      toggleEditPanel,
    ]
  );

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-gray-600">
        {t.similar.similarToCollection}
        {collection?.name ? `: ${collection.name}` : ''}
      </div>
      {isLoading && <div className="text-gray-500">{t.similar.loading}</div>}
      {isError && <div className="text-red-600">{t.similar.failed}</div>}
      {!isLoading && items.length === 0 && (
        <div className="text-gray-500">{t.similar.emptyTagsOrAutoTags}</div>
      )}
      {items.length > 0 ? (
        <StackTileGrid
          items={items}
          datasetId={datasetId}
          className={!selectionMode && infoSidebarOpen ? 'mr-80' : 'mr-0'}
          gridClassName="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2"
          role="list"
          ariaLabel={t.similar.ariaLabel}
          cornerRadius="none"
          isSelectionMode={selectionMode}
          selectedItems={selectedItems}
          selectedInfoItemId={selectedItemId}
          selectedActionCount={selectedItems.size}
          getLinkElement={getStackLinkElement}
          onClickItem={handleItemClick}
          onEnterSelectionMode={handleEnterSelectionMode}
          onToggleSelection={handleToggleSelection}
          onSelectRange={handleSelectRange}
          onOpenItem={handleOpenStack}
          onInfoItem={handleInfoStack}
          onFindSimilarItem={handleFindSimilarStack}
          onAddToScratchItem={handleAddToScratchStack}
          onDownloadItem={handleDownloadStack}
          onDownloadSelected={handleDownloadSelectedStacks}
          onBulkEditSelected={toggleEditPanel}
          onMergeSelected={
            selectedStackIdsInOrder.length >= 2 ? handleMergeSelectedStacks : undefined
          }
          onRemoveSelectedStacks={handleRemoveStacks}
          onToggleFavoriteItem={onToggleFavorite}
          onLikeItem={handleLikeStack}
          getDragHandlers={getStackDragHandlers}
        />
      ) : null}

      {createPortal(
        !selectionMode ? (
          <HeaderIconButton
            onClick={() => setInfoSidebarOpen(!infoSidebarOpen)}
            isActive={infoSidebarOpen}
            aria-label={infoSidebarOpen ? t.viewer.closeInfo : t.viewer.openInfo}
          >
            <Info size={18} />
          </HeaderIconButton>
        ) : null,
        document.getElementById('header-actions') || document.body
      )}

      {selectionMode && (
        <SelectionActionBar
          selectedCount={selectedItems.size}
          onClearSelection={clearSelection}
          onExitSelectionMode={exitSelectionMode}
          actions={selectionActions}
        />
      )}

      {isEditPanelOpen &&
        createPortal(
          <BulkEditPanel
            isOpen={isEditPanelOpen}
            selectedItems={selectedItems}
            onClose={() => setIsEditPanelOpen(false)}
            onSave={applyEditUpdates}
            items={selectedEditableItems}
          />,
          document.body
        )}

      {!selectionMode && <InfoSidebar />}
    </div>
  );
}
