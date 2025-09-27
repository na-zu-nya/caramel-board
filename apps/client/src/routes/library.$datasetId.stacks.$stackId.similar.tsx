import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { Clapperboard, Info, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BulkEditPanel, { type EditUpdates } from '@/components/BulkEditPanel';
import { StackGridItem } from '@/components/grid/StackGridItem';
import InfoSidebar from '@/components/InfoSidebar';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
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
import type { MediaGridItem } from '@/types';

export const Route = createFileRoute('/library/$datasetId/stacks/$stackId/similar')({
  component: SimilarStacksRoute,
});

function SimilarStacksRoute() {
  const { datasetId, stackId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [limit] = useState(50);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const [selectedItemId, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const [selectedItems, setSelectedItems] = useState<Set<string | number>>(new Set());
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const lastClickedIndexRef = useRef<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['similar-stacks', datasetId, stackId, limit],
    queryFn: () => apiClient.getSimilarStacks({ datasetId, stackId, limit, offset: 0 }),
    staleTime: 30_000,
  });

  const items = useMemo(() => (data?.stacks ?? []) as unknown as MediaGridItem[], [data]);

  // Header buttons: enable Selection toggle
  useHeaderActions({ showShuffle: false, showFilter: false, showSelection: true });

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

  // Selection helpers
  const handleToggleSelection = useCallback((itemId: string | number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedItems(new Set()), []);
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    clearSelection();
    setIsEditPanelOpen(false);
  }, [clearSelection, setSelectionMode]);

  const toggleEditPanel = useCallback(() => {
    if (selectedItems.size === 0) return;
    setIsEditPanelOpen((p) => !p);
  }, [selectedItems.size]);

  // Click handler with Cmd/Ctrl and Shift support
  const handleItemClick = useCallback(
    (item: MediaGridItem, event?: React.MouseEvent) => {
      const idx = items.findIndex((it) => it?.id === item.id);

      if (event && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (!selectionMode) setSelectionMode(true);
        handleToggleSelection(item.id);
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      if (event && event.shiftKey) {
        event.preventDefault();
        if (!selectionMode) setSelectionMode(true);
        const last = lastClickedIndexRef.current ?? idx;
        if (last >= 0 && idx >= 0) {
          const [start, end] = last < idx ? [last, idx] : [idx, last];
          const next = new Set(selectedItems);
          for (let i = start; i <= end; i++) {
            const it = items[i];
            if (it) next.add(it.id);
          }
          setSelectedItems(next);
        } else {
          handleToggleSelection(item.id);
        }
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      if (selectionMode) {
        event?.preventDefault();
        handleToggleSelection(item.id);
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      // If info panel open, show detail instead of navigating
      if (infoSidebarOpen) {
        setSelectedItemId(item.id);
        return;
      }

      // Normal navigation with ViewContext tracking (right→左 order)
      const loadedIdsLtr = items.map((s) =>
        typeof s.id === 'string' ? Number.parseInt(s.id as string, 10) : (s.id as number)
      );
      const ids = loadedIdsLtr.slice().reverse();
      const clickedId =
        typeof item.id === 'string' ? Number.parseInt(item.id as string, 10) : (item.id as number);
      const currentIndex = Math.max(
        0,
        ids.findIndex((id) => id === clickedId)
      );

      const mediaType = (item as any).mediaType as string | undefined;
      const token = genListToken({
        datasetId,
        mediaType,
        filters: { similarTo: Number(stackId) } as any,
      });
      saveViewContext({
        token,
        datasetId,
        mediaType: mediaType as any,
        filters: { similarTo: Number(stackId) } as any,
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
    [
      items,
      selectionMode,
      selectedItems,
      datasetId,
      stackId,
      setSelectionMode,
      handleToggleSelection,
      navigate,
      infoSidebarOpen,
      setSelectedItemId,
    ]
  );

  // Favorite toggle
  const onToggleFavorite = useCallback(
    async (item: MediaGridItem, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const currentFavorited = (item as any).favorited ?? (item as any).isFavorite ?? false;
        await apiClient.toggleStackFavorite(item.id, !currentFavorited);
        // Invalidate local caches
        queryClient.invalidateQueries({ queryKey: ['similar-stacks', datasetId, stackId, limit] });
        queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      } catch (err) {
        console.error('Failed to toggle favorite', err);
      }
    },
    [datasetId, stackId, limit, queryClient]
  );

  // Bulk edit handlers
  const applyEditUpdates = useCallback(
    async (updates: EditUpdates) => {
      if (selectedItems.size === 0) return;
      const stackIds = Array.from(selectedItems).map((id) =>
        typeof id === 'string' ? Number.parseInt(id as string, 10) : (id as number)
      );
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

  const refreshThumbnails = useCallback(async (stackIds: (string | number)[]) => {
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

  const removeStacks = useCallback(async (stackIds: (string | number)[]) => {
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

    const stackIds = Array.from(selectedItems).map((id) =>
      typeof id === 'string' ? Number.parseInt(id, 10) : id
    );

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

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-gray-600">Similar to #{stackId}</div>
      {isLoading && <div className="text-gray-500">Loading similar items…</div>}
      {isError && <div className="text-red-600">Failed to load similar items</div>}
      {!isLoading && items.length === 0 && (
        <div className="text-gray-500">No similar items yet (try updating AutoTags)</div>
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
        {items.map((it) => (
          <StackGridItem
            key={it.id}
            item={it}
            isSelected={selectedItems.has(it.id)}
            isInfoSelected={selectedItemId === it.id}
            isSelectionMode={selectionMode}
            isFavoritePending={false}
            onItemClick={handleItemClick}
            onToggleSelection={handleToggleSelection}
            onToggleFavorite={onToggleFavorite}
            selectedItems={selectedItems}
          />
        ))}
      </div>

      {/* Info button in header actions (hidden in selection mode) */}
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
                    label: 'Bulk Edit',
                    value: 'bulk-edit',
                    onSelect: toggleEditPanel,
                    icon: <Pencil size={12} />,
                    group: 'primary',
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
                ]
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
