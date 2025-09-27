import { useAtomValue, useSetAtom } from 'jotai';
import { Info, Loader2, Pencil } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { StackGridItem } from '@/components/grid/StackGridItem.tsx';
import { DropZone } from '@/components/ui/DropZone';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useStackGrid } from '@/hooks/features/useStackGrid';
import { useSparseInfiniteScroll } from '@/hooks/useSparseInfiniteScroll';
import { apiClient } from '@/lib/api-client';
import { applyScrollbarCompensation, removeScrollbarCompensation } from '@/lib/scrollbar-utils';
import { cn } from '@/lib/utils';
import { reorderModeAtom, selectionModeAtom } from '@/stores/ui';
import {
  addFilesToQueueAtom,
  addUploadNotificationAtom,
  uploadDefaultsAtom,
  uploadNotificationsAtom,
} from '@/stores/upload';
import type { Dataset, MediaGridItem, SortOption, StackFilter } from '@/types';
import BulkEditPanel from './BulkEditPanel.tsx';

interface SparseStackGridProps {
  datasetId: string;
  mediaType?: string;
  filter: StackFilter;
  sort?: SortOption;
  dataset?: Dataset;
  emptyState?: {
    icon: string;
    title: string;
    description: string;
  };
  onItemClick?: (item: MediaGridItem) => void;
  className?: string;
}

export default function SparseStackGrid({
  datasetId,
  mediaType,
  filter,
  sort,
  dataset,
  emptyState,
  onItemClick,
  className,
}: SparseStackGridProps) {
  const setSelectionMode = useSetAtom(selectionModeAtom);
  const reorderMode = useAtomValue(reorderModeAtom);
  const addFilesToQueue = useSetAtom(addFilesToQueueAtom);
  const setUploadDefaults = useSetAtom(uploadDefaultsAtom);
  const addNotification = useSetAtom(addUploadNotificationAtom);
  const uploadNotifications = useAtomValue(uploadNotificationsAtom);

  // While this grid is mounted, stabilize body scrollbar gutter for contextmenu reflows
  useEffect(() => {
    applyScrollbarCompensation();
    return () => {
      removeScrollbarCompensation();
    };
  }, []);

  // Initialize upload queue processing

  // Use sparse infinite scroll hook
  const {
    total,
    sparseItems,
    requestLoadRange,
    isRangeLoaded,
    isLoading,
    loadingProgress,
    refreshAll,
  } = useSparseInfiniteScroll({
    datasetId,
    mediaType,
    filter,
    sort,
    pageSize: 50,
    throttleMs: 300, // 300ms throttle between requests
  });

  const {
    containerRef,
    infoSidebarOpen,
    setInfoSidebarOpen,
    isSelectionMode,
    selectedItemId,
    selectedItems,
    setSelectedItems,
    isEditPanelOpen,
    setIsEditPanelOpen,
    itemsPerRow,
    itemSize,
    favoriteStates,
    favoriteOverrides,
    handleItemClick,
    handleToggleSelection,
    handleToggleFavorite,
    handleDeselectAll,
    applyEditUpdates,
    closeEditPanel,
    isSidebarAnimating,
  } = useStackGrid({
    items: sparseItems.filter((item): item is MediaGridItem => item !== undefined), // Only pass actual items for selection logic
    total,
    hasMore: false, // Not used in sparse mode
    isLoading,
    error: null,
    onItemClick,
    onRefreshAll: refreshAll,
  });

  // Cmd/Ctrl + Click and Shift + Click selection support
  const lastClickedIndexRef = useRef<number | null>(null);

  const onTileClick = useCallback(
    (item: MediaGridItem, e?: React.MouseEvent) => {
      const id = item.id;
      const idx = sparseItems.findIndex((it) => it?.id === id);

      if (e && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSelectionMode(true);
        handleToggleSelection(id);
        lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
        return;
      }

      if (e?.shiftKey) {
        e.preventDefault();
        setSelectionMode(true);
        const last = lastClickedIndexRef.current ?? idx;
        if (last >= 0 && idx >= 0) {
          const [start, end] = last < idx ? [last, idx] : [idx, last];
          const next = new Set(selectedItems);
          for (let i = start; i <= end; i++) {
            const it = sparseItems[i];
            if (it) next.add(it.id);
          }
          setSelectedItems(next);
        } else {
          handleToggleSelection(id);
        }
        lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
        return;
      }

      lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
      handleItemClick(item, onItemClick);
    },
    [
      sparseItems,
      selectedItems,
      setSelectedItems,
      setSelectionMode,
      handleToggleSelection,
      handleItemClick,
      onItemClick,
    ]
  );

  // Handle scroll-based loading
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || isSidebarAnimating) return;

    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const headerOffset = 56;

    // Calculate visible area
    const visibleTop = scrollTop - headerOffset;
    const visibleBottom = visibleTop + clientHeight;

    // Calculate which items should be visible
    const startRow = Math.floor(visibleTop / itemSize);
    const endRow = Math.ceil(visibleBottom / itemSize);

    // Add buffer for smooth scrolling + small prefetch to avoid white gaps
    const bufferRows = 3;
    const prefetchRowsBelow = 1; // 下1段を先読み
    const expandedStartRow = Math.max(0, startRow - bufferRows);
    const expandedEndRow = endRow + bufferRows;

    // Convert to item indices
    const startIndex = expandedStartRow * itemsPerRow;
    // 読み込みは表示範囲よりさらに1段先まで要求
    const endIndex = Math.min(
      total - 1,
      (expandedEndRow + prefetchRowsBelow + 1) * itemsPerRow - 1
    );

    // Only request if we don't already have this range
    if (startIndex < total && !isRangeLoaded(startIndex, endIndex)) {
      console.log(`🔄 Requesting range ${startIndex}-${endIndex} (scroll-based)`);
      requestLoadRange(startIndex, endIndex);
    }
  }, [
    containerRef,
    itemSize,
    itemsPerRow,
    total,
    isRangeLoaded,
    requestLoadRange,
    isSidebarAnimating,
  ]);

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, handleScroll]);

  // Initial load
  useEffect(() => {
    if (total > 0 && sparseItems.length === total) {
      // Load initial visible range
      const initialEndIndex = Math.min(total - 1, 49); // First 50 items
      if (!isRangeLoaded(0, initialEndIndex)) {
        requestLoadRange(0, initialEndIndex);
      }
    }
  }, [total, sparseItems.length, isRangeLoaded, requestLoadRange]);

  // Handle file uploads
  const handleFilesDrop = useCallback(
    (files: File[]) => {
      if (!dataset) return;

      // Set upload defaults based on current context
      const collectionMatch = window.location.pathname.match(/collections\/(\d+)/);
      const collectionId = collectionMatch ? Number.parseInt(collectionMatch[1], 10) : undefined;
      setUploadDefaults({
        datasetId: Number(dataset.id),
        mediaType: collectionId ? 'image' : mediaType || undefined,
        collectionId,
      });

      // Add files to upload queue
      addFilesToQueue({ files, type: 'new-stack' });
    },
    [dataset, mediaType, setUploadDefaults, addFilesToQueue]
  );

  const handleUrlDrop = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return;

      const datasetNumericId = dataset?.id ? Number(dataset.id) : Number(datasetId);
      if (Number.isNaN(datasetNumericId)) {
        addNotification({ type: 'error', message: 'データセットが特定できませんでした' });
        return;
      }

      const collectionMatch = window.location.pathname.match(/collections\/(\d+)/);
      const collectionId = collectionMatch ? Number.parseInt(collectionMatch[1], 10) : undefined;
      const targetMediaType = collectionId ? 'image' : mediaType || undefined;

      addNotification({
        type: 'info',
        message: `${urls.length}件のURLをダウンロード中です`,
      });

      try {
        const { results } = await apiClient.importAssetsFromUrls({
          urls,
          dataSetId: datasetNumericId,
          mediaType: targetMediaType,
          collectionId,
        });

        const successes = results.filter((r) => r.status === 'created' || r.status === 'added');
        const failures = results.filter((r) => r.status === 'error');

        if (successes.length > 0) {
          addNotification({
            type: 'success',
            message: `${successes.length}件のURLからアップロードしました`,
          });
        }

        if (failures.length > 0) {
          const summary = failures
            .map((failure) => failure.message || failure.url)
            .filter(Boolean)
            .slice(0, 2)
            .join(' / ');
          addNotification({
            type: 'error',
            message:
              failures.length === urls.length
                ? 'URLのアップロードに失敗しました'
                : `${failures.length}件のURLでエラーが発生しました${summary ? `: ${summary}` : ''}`,
          });
        }
      } catch (error) {
        console.error('Failed to import URLs for sparse grid', error);
        addNotification({ type: 'error', message: 'URLのアップロードに失敗しました' });
      }
    },
    [dataset?.id, datasetId, mediaType, addNotification]
  );

  // Loading state
  if (isLoading && sparseItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (total === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-6xl mb-4">{emptyState?.icon || '📸'}</div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          {emptyState?.title || 'No items found'}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          {emptyState?.description || 'Try adjusting your filters or upload some content.'}
        </p>
      </div>
    );
  }

  // Calculate grid layout
  const totalRows = Math.ceil(total / itemsPerRow);
  const gridHeight = totalRows * itemSize;

  return (
    <DropZone
      onFilesDrop={handleFilesDrop}
      onUrlDrop={handleUrlDrop}
      className={cn('relative', className)}
    >
      <div
        ref={containerRef}
        className={cn(
          // Smoothly follow sidebar/InfoPanel without reflow jumps
          'h-full overflow-auto transition-[padding] duration-300 ease-in-out',
          infoSidebarOpen ? 'pr-80' : 'pr-0'
        )}
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* Loading progress indicator */}
        {isLoading && (
          <div className="fixed top-14 left-0 right-0 z-50">
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-1">
              <div
                className="bg-blue-500 h-1 transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Virtual grid container */}
        <div className="relative w-full" style={{ height: gridHeight }}>
          {/* Render visible items */}
          {sparseItems.map((item, index) => {
            const row = Math.floor(index / itemsPerRow);
            const col = index % itemsPerRow;
            const top = row * itemSize;
            const left = col * (100 / itemsPerRow);

            return (
              <div
                key={item ? `stack-${item.id}` : `placeholder-${index}`}
                className="absolute"
                style={{
                  top: `${top}px`,
                  left: `${left}%`,
                  width: `${100 / itemsPerRow}%`,
                  height: `${itemSize}px`,
                  padding: '4px',
                }}
              >
                <StackGridItem
                  item={item} // May be undefined - handled by GridItem
                  index={index}
                  isSelected={item ? selectedItems.has(item.id) : false}
                  isInfoSelected={item ? selectedItemId === item.id : false}
                  isAnchorItem={false}
                  isSelectionMode={isSelectionMode}
                  isReorderMode={reorderMode}
                  isFavoritePending={item ? favoriteStates.has(item.id) : false}
                  overrideFavorited={item ? favoriteOverrides.get(item.id) : undefined}
                  onItemClick={onTileClick}
                  onToggleSelection={handleToggleSelection}
                  onToggleFavorite={handleToggleFavorite}
                  onReorder={() => {}} // Not implemented in sparse mode
                />
              </div>
            );
          })}
        </div>

        {/* Upload notifications */}
        {uploadNotifications.map((notification) => (
          <div
            key={notification.id}
            className="fixed bottom-4 right-4 bg-blue-500 text-white p-4 rounded-lg shadow-lg z-[120]"
          >
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{notification.message}</span>
            </div>
            {notification.progress !== undefined && (
              <div className="mt-2 w-full bg-blue-400 rounded-full h-2">
                <div
                  className="bg-white h-2 rounded-full transition-all duration-300"
                  style={{ width: `${notification.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Selection Action Bar */}
      {isSelectionMode && selectedItems.size > 0 && (
        <SelectionActionBar
          selectedCount={selectedItems.size}
          onClearSelection={handleDeselectAll}
          onExitSelectionMode={() => setSelectionMode(false)}
          actions={[
            {
              label: 'Bulk Edit',
              value: 'bulk-edit',
              onSelect: () => setIsEditPanelOpen((prev) => !prev),
              icon: <Pencil size={12} />,
              group: 'primary',
            },
          ]}
        />
      )}

      {/* Info Sidebar Toggle */}
      <HeaderIconButton
        icon={Info}
        label="Toggle Info Sidebar"
        onClick={() => setInfoSidebarOpen(!infoSidebarOpen)}
        className={cn(
          'fixed top-4 right-4 z-50 transition-colors',
          infoSidebarOpen ? 'bg-blue-500 text-white' : 'text-white hover:bg-white/20'
        )}
      />

      {/* Info Sidebar moved to root for persistent mounting */}

      {isEditPanelOpen &&
        createPortal(
          <BulkEditPanel
            isOpen={isEditPanelOpen}
            selectedItems={Array.from(selectedItems)
              .map((id) => sparseItems.find((item) => item?.id === id))
              .filter((item): item is MediaGridItem => item !== undefined)}
            onClose={closeEditPanel}
            onApplyUpdates={applyEditUpdates}
          />,
          document.body
        )}
    </DropZone>
  );
}
