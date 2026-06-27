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
import { useRightPanelPushesContent } from '@/hooks/useSidebarLayoutMode';
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

export const Route = createFileRoute('/library/$datasetId/stacks/$stackId/similar')({
  component: SimilarStacksRoute,
});

type SimilarStackFilter = StackFilter & { similarTo: number };

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

function SimilarStacksRoute() {
  const t = useT();
  const { datasetId, stackId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { onOpen, onInfo, onFindSimilar, onAddToScratch, onDownload, onLike, dragProps } =
    useStackTile(datasetId);
  const [limit] = useState(50);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [_currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const infoSidebarPushesContent = useRightPanelPushesContent(!selectionMode && infoSidebarOpen);
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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['similar-stacks', datasetId, stackId, limit],
    queryFn: () => apiClient.getSimilarStacks({ datasetId, stackId, limit, offset: 0 }),
    staleTime: 30_000,
  });

  const items = useMemo<MediaGridItem[]>(
    () => (data?.stacks ?? []).map((stack) => ({ ...stack, stackId: stack.stackId ?? stack.id })),
    [data]
  );

  // Ensure currentFilter carries dataset context for downstream components
  useEffect(() => {
    setCurrentFilter((prev) => ({ ...prev, datasetId }));
  }, [datasetId, setCurrentFilter]);

  useEffect(() => {
    // 参照スタックの埋め込み生成待ちの場合、定期的にリトライ（軽めの実装）
    if (!isLoading && !isError && (items?.length ?? 0) === 0) {
      const t = setTimeout(() => void refetch(), 1500);
      return () => clearTimeout(t);
    }
  }, [items, isLoading, isError, refetch]);

  const toggleEditPanel = useCallback(() => {
    if (selectedItems.size === 0) return;
    setIsEditPanelOpen((p) => !p);
  }, [selectedItems.size, setIsEditPanelOpen]);

  const selectedStackIdsInOrder = useMemo(() => {
    return getSelectedMediaGridStackIds(selectedItemOrder, items);
  }, [items, selectedItemOrder]);

  const navigateToItem = useCallback(
    (item: MediaGridItem) => {
      const ids = items
        .map((similarItem) => toStackId(similarItem.id))
        .filter((id): id is number => id !== null);
      const clickedId = toStackId(item.id);
      if (clickedId === null) return;
      const currentIndex = Math.max(0, ids.indexOf(clickedId));
      const mediaType = item.mediaType;
      const filters: SimilarStackFilter = { datasetId, similarTo: Number(stackId) };
      const token = genListToken({
        datasetId,
        mediaType,
        filters,
      });

      saveViewContext({
        token,
        datasetId,
        mediaType,
        filters,
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
    [datasetId, items, navigate, stackId]
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

  // 通常クリック時の遷移だけを持ち、選択操作は StackTileGrid 側に委譲する
  const handleItemClick = useCallback(
    (item: MediaGridItem, event?: React.MouseEvent) => {
      event?.preventDefault();
      // If info panel open, show detail instead of navigating
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

  // Favorite toggle
  const similarQueryKey = useMemo(
    () => ['similar-stacks', datasetId, stackId, limit] as const,
    [datasetId, stackId, limit]
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
      } catch (err) {
        patchSimilarFavorite(itemId, currentFavorited);
        console.error('Failed to toggle favorite', err);
      }
    },
    [datasetId, patchSimilarFavorite, queryClient, similarQueryKey]
  );

  // Bulk edit handlers
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

  const refreshStacks = useCallback(async (stackIds: (string | number)[]) => {
    if (stackIds.length === 0) return;
    await apiClient.refreshStacks(stackIds);
  }, []);

  const handleRefreshStacks = useCallback(
    async (targetStackIds?: Array<string | number>) => {
      const stackIds = targetStackIds ?? selectedStackIdsInOrder;
      if (stackIds.length === 0) return;

      try {
        await refreshStacks(stackIds);
        exitSelectionMode();
        await refetch();
      } catch (error) {
        console.error('Error refreshing stacks:', error);
      }
    },
    [selectedStackIdsInOrder, refreshStacks, exitSelectionMode, refetch]
  );

  const removeStacks = useCallback(async (stackIds: (string | number)[]) => {
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

  const handleMergeStacks = useCallback(async () => {
    if (selectedStackIdsInOrder.length < 2) return;

    const [targetId, ...sourceIds] = selectedStackIdsInOrder;

    try {
      await apiClient.mergeStacks(targetId, sourceIds);
      exitSelectionMode();
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['stack'] }),
        queryClient.invalidateQueries({ queryKey: ['stacks'] }),
        queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
        queryClient.invalidateQueries({ queryKey: ['likes', 'yearly'] }),
        queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] }),
      ]);
      await refetch();
    } catch (error) {
      console.error('Error merging stacks:', error);
      alert(t.grid.mergeStacksFailed);
    }
  }, [datasetId, exitSelectionMode, queryClient, refetch, selectedStackIdsInOrder, t]);

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

  const selectionActions = useMemo(
    () =>
      createStackSelectionActions({
        selectedCount: selectedItems.size,
        copy: {
          bulkEdit: t.grid.bulkEdit,
          downloadSelected: t.contextMenu.downloadSelected,
          addToScratch: t.contextMenu.addToScratch,
          addToCollection: t.contextMenu.addToCollection,
          createNewCollection: t.contextMenu.createNewCollection,
          collectionLoading: t.collection.loading,
          noCollectionsAvailable: t.contextMenu.noCollectionsAvailable,
          mergeStacks: t.grid.mergeStacks,
          refresh: t.grid.refresh,
          removeFromCollection: t.contextMenu.removeFromCollection,
          removeFromScratch: t.contextMenu.removeFromScratch,
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
        refresh: { onSelect: () => handleRefreshStacks() },
        deleteStacks: { onSelect: handleRemoveStacks },
      }),
    [
      handleDownloadSelectedStacks,
      handleMergeStacks,
      handleRefreshStacks,
      handleRemoveStacks,
      selectedItems.size,
      selectedStackIdsInOrder,
      t,
      toggleEditPanel,
    ]
  );

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-gray-600">{t.similar.similarTo(stackId)}</div>
      {isLoading && <div className="text-gray-500">{t.similar.loading}</div>}
      {isError && <div className="text-red-600">{t.similar.failed}</div>}
      {!isLoading && items.length === 0 && (
        <div className="text-gray-500">{t.similar.emptyAutoTags}</div>
      )}
      {items.length > 0 ? (
        <StackTileGrid
          items={items}
          datasetId={datasetId}
          className={infoSidebarPushesContent ? 'mr-80' : 'mr-0'}
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
          onRefreshStacks={handleRefreshStacks}
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

      {/* Info button in header actions (hidden in selection mode) */}
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

      {/* Selection Action Bar */}
      {selectionMode && (
        <SelectionActionBar
          selectedCount={selectedItems.size}
          onClearSelection={clearSelection}
          onExitSelectionMode={exitSelectionMode}
          actions={selectionActions}
        />
      )}

      {/* Bulk Edit Panel */}
      {isEditPanelOpen &&
        createPortal(
          <BulkEditPanel
            isOpen={isEditPanelOpen}
            selectedItems={selectedItems}
            onClose={() => setIsEditPanelOpen(false)}
            onSave={applyEditUpdates}
            items={items.filter((s) => selectedItems.has(s.id))}
          />,
          document.body
        )}

      {/* InfoSidebar - only show when not in selection mode */}
      {!selectionMode && <InfoSidebar />}
    </div>
  );
}
