import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { Clapperboard, GitMerge, Info, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import MersenneTwister from 'mersenne-twister';
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
import { useT } from '@/lib/i18n';
import { getSelectedMediaGridStackIds } from '@/lib/media-grid-selection';
import { cn } from '@/lib/utils';
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
  const [limit] = useState(50);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [_currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const [selectedItemId, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const [favoritePending, setFavoritePending] = useState<Set<string | number>>(() => new Set());
  const lastClickedIndexRef = useRef<number | null>(null);
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
        .filter((id): id is number => id !== null)
        .reverse();
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

  // Click handler with Cmd/Ctrl and Shift support
  const handleItemClick = useCallback(
    (item: MediaGridItem, event?: React.MouseEvent) => {
      const idx = items.findIndex((it) => it?.id === item.id);

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
        if (!selectionMode) {
          setSelectionMode(true);
          clearSelection();
          toggleItemSelection(item.id);
          if (idx >= 0) lastClickedIndexRef.current = idx;
          return;
        }

        setSelectionMode(true);
        const last = lastClickedIndexRef.current ?? idx;
        if (last >= 0 && idx >= 0) {
          const step = last <= idx ? 1 : -1;
          const rangeIds: Array<string | number> = [];
          for (let i = last; step > 0 ? i <= idx : i >= idx; i += step) {
            const it = items[i];
            if (it) rangeIds.push(it.id);
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

      // If info panel open, show detail instead of navigating
      if (infoSidebarOpen) {
        setSelectedItemId(item.id);
        return;
      }

      navigateToItem(item);
    },
    [
      items,
      selectionMode,
      setSelectionMode,
      clearSelection,
      toggleItemSelection,
      selectItemRange,
      infoSidebarOpen,
      setSelectedItemId,
      navigateToItem,
    ]
  );

  const handleToggleSelection = useCallback(
    (itemId: string | number) => {
      if (!selectionMode) {
        setSelectionMode(true);
      }
      toggleItemSelection(itemId);

      const idx = items.findIndex((item) => item?.id === itemId);
      if (idx >= 0) {
        lastClickedIndexRef.current = idx;
      }
    },
    [items, selectionMode, setSelectionMode, toggleItemSelection]
  );

  // Favorite toggle
  const similarQueryKey = useMemo(
    () => ['similar-stacks', datasetId, stackId, limit] as const,
    [datasetId, stackId, limit]
  );

  const setFavoritePendingForItem = useCallback((itemId: string | number, pending: boolean) => {
    setFavoritePending((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  }, []);

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
    async (item: MediaGridItem, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const currentFavorited = Boolean(item.favorited ?? item.isFavorite);
      const nextFavorited = !currentFavorited;
      const itemId = item.id;
      setFavoritePendingForItem(itemId, true);
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
      } finally {
        setFavoritePendingForItem(itemId, false);
      }
    },
    [datasetId, patchSimilarFavorite, queryClient, setFavoritePendingForItem, similarQueryKey]
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

  const refreshThumbnails = useCallback(async (stackIds: (string | number)[]) => {
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

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-gray-600">{t.similar.similarTo(stackId)}</div>
      {isLoading && <div className="text-gray-500">{t.similar.loading}</div>}
      {isError && <div className="text-red-600">{t.similar.failed}</div>}
      {!isLoading && items.length === 0 && (
        <div className="text-gray-500">{t.similar.emptyAutoTags}</div>
      )}
      <div
        className={cn(
          'grid gap-2',
          'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
          !selectionMode && infoSidebarOpen ? 'mr-80' : 'mr-0'
        )}
        role="list"
        aria-label={t.similar.ariaLabel}
      >
        {items.map((it) => (
          <StackGridItem
            key={it.id}
            item={it}
            isSelected={selectedItems.has(it.id)}
            isInfoSelected={selectedItemId === it.id}
            isSelectionMode={selectionMode}
            isFavoritePending={favoritePending.has(it.id)}
            onItemClick={handleItemClick}
            onToggleSelection={handleToggleSelection}
            onToggleFavorite={onToggleFavorite}
            selectedItems={selectedItems}
            selectedStackIdsInOrder={selectedStackIdsInOrder}
            onMergeStacks={handleMergeStacks}
          />
        ))}
      </div>

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
          actions={
            selectedItems.size > 0
              ? [
                  {
                    label: t.grid.bulkEdit,
                    value: 'bulk-edit',
                    onSelect: toggleEditPanel,
                    icon: <Pencil size={12} />,
                    group: 'primary' as const,
                  },
                  {
                    label: t.grid.mergeStacks,
                    value: 'merge-stacks',
                    onSelect: handleMergeStacks,
                    icon: <GitMerge size={12} />,
                    confirmMessage:
                      selectedStackIdsInOrder.length >= 2
                        ? t.grid.mergeStacksConfirm(
                            selectedStackIdsInOrder[0],
                            selectedStackIdsInOrder.length - 1
                          )
                        : undefined,
                    group: 'primary' as const,
                  },
                  {
                    label: t.grid.refreshThumbnails,
                    value: 'refresh-thumbnails',
                    onSelect: handleRefreshThumbnails,
                    icon: <RefreshCw size={12} />,
                  },
                  {
                    label: t.grid.optimizeVideo,
                    value: 'optimize-video',
                    onSelect: handleOptimizePreviews,
                    icon: <Clapperboard size={12} />,
                  },
                  {
                    label: t.grid.deleteStacks,
                    value: 'delete-stacks',
                    onSelect: handleRemoveStacks,
                    icon: <Trash2 size={12} />,
                    confirmMessage: t.grid.deleteStacksConfirm(selectedItems.size),
                    destructive: true,
                  },
                ].filter(
                  (action) => action.value !== 'merge-stacks' || selectedStackIdsInOrder.length >= 2
                )
              : []
          }
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
