import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { Clapperboard, GitMerge, Info, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BulkEditPanel, { type EditUpdates } from '@/components/BulkEditPanel';
import { StackGridItem } from '@/components/grid/StackGridItem';
import InfoSidebar from '@/components/InfoSidebar';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useSelectionMode } from '@/hooks/features/useSelectionMode';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  currentFilterAtom,
  infoSidebarOpenAtom,
  selectedItemIdAtom,
  selectionModeAtom,
} from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaGridItem, StackFilter } from '@/types';

export const Route = createFileRoute('/library/$datasetId/collections/$collectionId/similar')({
  component: CollectionSimilarRoute,
});

const toStackId = (id: string | number): number | null => {
  const numericId = typeof id === 'string' ? Number.parseInt(id, 10) : id;
  return Number.isFinite(numericId) ? numericId : null;
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
  const { datasetId, collectionId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [limit] = useState(50);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [_currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const [selectedItemId, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const lastClickedIndexRef = useRef<number | null>(null);
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

  const items = useMemo<MediaGridItem[]>(() => data?.stacks ?? [], [data]);

  useHeaderActions({ showShuffle: false, showFilter: false, showSelection: true });

  useEffect(() => {
    const filter: StackFilter = {
      datasetId,
      collectionId,
    };
    setCurrentFilter(filter);
  }, [collectionId, datasetId, setCurrentFilter]);

  const selectedStackIdsInOrder = useMemo(() => {
    const stackIds: number[] = [];
    for (const selectedId of selectedItemOrder) {
      const stackId = toStackId(selectedId);
      if (stackId !== null) {
        stackIds.push(stackId);
      }
    }
    return stackIds;
  }, [selectedItemOrder]);

  const handleItemClick = useCallback(
    (item: MediaGridItem, event?: React.MouseEvent) => {
      const idx = items.findIndex((candidate) => candidate?.id === item.id);

      if (event && (event.metaKey || event.ctrlKey)) {
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }
      if (event?.altKey) {
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      if (event?.shiftKey) {
        event.preventDefault();
        if (!selectionMode) setSelectionMode(true);
        const last = lastClickedIndexRef.current ?? idx;
        if (last >= 0 && idx >= 0) {
          const step = last <= idx ? 1 : -1;
          const rangeIds: Array<string | number> = [];
          for (let i = last; step > 0 ? i <= idx : i >= idx; i += step) {
            const rangeItem = items[i];
            if (rangeItem) rangeIds.push(rangeItem.id);
          }
          selectItemRange(rangeIds);
        } else {
          toggleItemSelection(item.id);
        }
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      if (selectionMode) {
        event?.preventDefault();
        toggleItemSelection(item.id);
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      if (infoSidebarOpen) {
        setSelectedItemId(item.id);
        return;
      }

      const loadedIds = items
        .map((loadedItem) => toStackId(loadedItem.id))
        .filter((id): id is number => id !== null)
        .reverse();
      const clickedId = toStackId(item.id);
      const currentIndex = clickedId !== null ? Math.max(0, loadedIds.indexOf(clickedId)) : 0;
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
        ids: loadedIds,
        currentIndex,
        createdAt: Date.now(),
      });

      navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId, stackId: String(item.id) },
        search: { page: 0, mediaType, listToken: token },
      });
    },
    [
      items,
      selectionMode,
      infoSidebarOpen,
      datasetId,
      collectionId,
      setSelectionMode,
      selectItemRange,
      toggleItemSelection,
      setSelectedItemId,
      navigate,
    ]
  );

  const handleToggleSelection = useCallback(
    (itemId: string | number) => {
      if (!selectionMode) setSelectionMode(true);
      toggleItemSelection(itemId);

      const idx = items.findIndex((item) => item?.id === itemId);
      if (idx >= 0) {
        lastClickedIndexRef.current = idx;
      }
    },
    [items, selectionMode, setSelectionMode, toggleItemSelection]
  );

  const onToggleFavorite = useCallback(
    async (item: MediaGridItem, event: React.MouseEvent) => {
      event.stopPropagation();
      try {
        const currentFavorited = Boolean(item.favorited ?? item.isFavorite);
        await apiClient.toggleStackFavorite(item.id, !currentFavorited);
        await Promise.allSettled([
          queryClient.invalidateQueries({
            queryKey: ['collection-similar-stacks', datasetId, collectionId, limit],
          }),
          queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
        ]);
      } catch (error) {
        console.error('Failed to toggle favorite', error);
      }
    },
    [collectionId, datasetId, limit, queryClient]
  );

  const applyEditUpdates = useCallback(
    async (updates: EditUpdates) => {
      if (selectedItems.size === 0) return;
      const stackIds = Array.from(selectedItems)
        .map(toStackId)
        .filter((id): id is number => id !== null);
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
    [selectedItems, clearSelection, exitSelectionMode, refetch]
  );

  const refreshThumbnails = useCallback(async (stackIds: Array<string | number>) => {
    if (stackIds.length === 0) return;
    await apiClient.bulkRefreshThumbnails(stackIds);
  }, []);

  const handleRefreshThumbnails = useCallback(async () => {
    if (selectedItems.size === 0) return;
    const stackIds = Array.from(selectedItems);
    try {
      await refreshThumbnails(stackIds);
      exitSelectionMode();
      await refetch();
    } catch (error) {
      console.error('Error refreshing thumbnails:', error);
    }
  }, [selectedItems, refreshThumbnails, exitSelectionMode, refetch]);

  const removeStacks = useCallback(async (stackIds: Array<string | number>) => {
    if (stackIds.length === 0) return;
    await apiClient.bulkRemoveStacks(stackIds);
  }, []);

  const handleRemoveStacks = useCallback(async () => {
    if (selectedItems.size === 0) return;
    const stackIds = Array.from(selectedItems);
    try {
      await removeStacks(stackIds);
      exitSelectionMode();
      await refetch();
    } catch (error) {
      console.error('Error removing stacks:', error);
    }
  }, [selectedItems, removeStacks, exitSelectionMode, refetch]);

  const handleOptimizePreviews = useCallback(async () => {
    if (selectedItems.size === 0) return;

    const stackIds = Array.from(selectedItems)
      .map(toStackId)
      .filter((id): id is number => id !== null);

    try {
      for (const id of stackIds) {
        await apiClient.regenerateStackPreview({ stackId: id, datasetId, force: true });
      }

      exitSelectionMode();
      await refetch();
    } catch (error) {
      console.error('Error optimizing video previews:', error);
      alert('Failed to optimize video previews. Please try again.');
    }
  }, [selectedItems, datasetId, exitSelectionMode, refetch]);

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
      alert('スタックのマージに失敗しました');
    }
  }, [
    selectedStackIdsInOrder,
    exitSelectionMode,
    queryClient,
    datasetId,
    collectionId,
    limit,
    refetch,
  ]);

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

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-gray-600">
        Similar to collection{collection?.name ? `: ${collection.name}` : ''}
      </div>
      {isLoading && <div className="text-gray-500">Loading similar items…</div>}
      {isError && <div className="text-red-600">Failed to load similar items</div>}
      {!isLoading && items.length === 0 && (
        <div className="text-gray-500">No similar items yet (try updating tags or AutoTags)</div>
      )}
      <div
        className={cn(
          'grid gap-2',
          'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
          !selectionMode && infoSidebarOpen ? 'mr-80' : 'mr-0'
        )}
        role="list"
        aria-label="Similar stacks"
      >
        {items.map((item) => (
          <StackGridItem
            key={item.id}
            item={item}
            isSelected={selectedItems.has(item.id)}
            isInfoSelected={selectedItemId === item.id}
            isSelectionMode={selectionMode}
            isFavoritePending={false}
            onItemClick={handleItemClick}
            onToggleSelection={handleToggleSelection}
            onToggleFavorite={onToggleFavorite}
            selectedItems={selectedItems}
            selectedStackIdsInOrder={selectedStackIdsInOrder}
            onMergeStacks={handleMergeStacks}
          />
        ))}
      </div>

      {createPortal(
        !selectionMode ? (
          <HeaderIconButton
            onClick={() => setInfoSidebarOpen(!infoSidebarOpen)}
            isActive={infoSidebarOpen}
            aria-label={infoSidebarOpen ? 'Close info panel' : 'Open info panel'}
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
          actions={
            selectedItems.size > 0
              ? [
                  {
                    label: 'Bulk Edit',
                    value: 'bulk-edit',
                    onSelect: toggleEditPanel,
                    icon: <Pencil size={12} />,
                    group: 'primary' as const,
                  },
                  {
                    label: 'Merge Stacks',
                    value: 'merge-stacks',
                    onSelect: handleMergeStacks,
                    icon: <GitMerge size={12} />,
                    confirmMessage:
                      selectedStackIdsInOrder.length >= 2
                        ? `選択順の先頭スタック #${selectedStackIdsInOrder[0]} に残り ${selectedStackIdsInOrder.length - 1} 件をマージします。実行しますか？`
                        : undefined,
                    group: 'primary' as const,
                  },
                  {
                    label: 'Refresh Thumbnails',
                    value: 'refresh-thumbnails',
                    onSelect: handleRefreshThumbnails,
                    icon: <RefreshCw size={12} />,
                  },
                  {
                    label: 'Optimize Video',
                    value: 'optimize-video',
                    onSelect: handleOptimizePreviews,
                    icon: <Clapperboard size={12} />,
                  },
                  {
                    label: 'Delete Stacks',
                    value: 'delete-stacks',
                    onSelect: handleRemoveStacks,
                    icon: <Trash2 size={12} />,
                    confirmMessage: `選択した${selectedItems.size}件のスタックを削除します。元に戻せません。`,
                    destructive: true,
                  },
                ].filter(
                  (action) => action.value !== 'merge-stacks' || selectedStackIdsInOrder.length >= 2
                )
              : []
          }
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
