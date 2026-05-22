import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { GitMerge, Info, Loader2, Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StackGridItem } from '@/components/grid/StackGridItem.tsx';
import { FolderDropDialog } from '@/components/modals/FolderDropDialog.tsx';
import { DropZone } from '@/components/ui/DropZone';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useStackGrid } from '@/hooks/features/useStackGrid';
import { useSparseInfiniteScroll } from '@/hooks/useSparseInfiniteScroll';
import { apiClient } from '@/lib/api-client';
import {
  type FolderGroup,
  type FolderUploadDefaults,
  type FolderUploadMode,
  splitFilesByTopLevelFolder,
  uploadFolderAsCollection,
  uploadFolderAsSingleStack,
} from '@/lib/folder-import';
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

interface FolderImportRequest {
  id: string;
  name: string;
  files: File[];
  defaults: FolderUploadDefaults;
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
  const queryClient = useQueryClient();
  const setSelectionMode = useSetAtom(selectionModeAtom);
  const reorderMode = useAtomValue(reorderModeAtom);
  const addFilesToQueue = useSetAtom(addFilesToQueueAtom);
  const setUploadDefaults = useSetAtom(uploadDefaultsAtom);
  const addNotification = useSetAtom(addUploadNotificationAtom);
  const uploadNotifications = useAtomValue(uploadNotificationsAtom);

  const [folderQueue, setFolderQueue] = useState<FolderImportRequest[]>([]);
  const [activeFolder, setActiveFolder] = useState<FolderImportRequest | null>(null);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isProcessingFolder, setIsProcessingFolder] = useState(false);

  useEffect(() => {
    if (isProcessingFolder) return;
    if (!activeFolder && folderQueue.length > 0) {
      setActiveFolder(folderQueue[0]);
      setFolderQueue((prev) => prev.slice(1));
      setIsFolderDialogOpen(true);
    }
  }, [activeFolder, folderQueue, isProcessingFolder]);

  const computeUploadDefaults = useCallback((): FolderUploadDefaults | null => {
    const datasetNumericId = dataset?.id ? Number(dataset.id) : Number(datasetId);
    if (!Number.isFinite(datasetNumericId)) {
      console.error('Failed to resolve dataset ID for sparse folder import', datasetId);
      return null;
    }

    const collectionMatch = window.location.pathname.match(/collections\/(\d+)/);
    const collectionId = collectionMatch ? Number.parseInt(collectionMatch[1], 10) : undefined;
    const targetMediaType = collectionId ? 'image' : mediaType || undefined;

    const tags = Array.isArray(filter.tags) ? filter.tags : undefined;
    const author =
      Array.isArray(filter.authors) && filter.authors.length > 0 ? filter.authors[0] : undefined;

    return {
      datasetId: datasetNumericId,
      mediaType: targetMediaType,
      tags,
      author,
      collectionId,
    };
  }, [dataset?.id, datasetId, mediaType, filter.tags, filter.authors]);

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

  const refreshAfterManualUpload = useCallback(async () => {
    try {
      await refreshAll();
      if (total > 0) {
        const endIndex = Math.min(99, total - 1);
        requestLoadRange(0, endIndex);
      }
      void queryClient.invalidateQueries({ queryKey: ['stacks'] });
      void queryClient.invalidateQueries({ queryKey: ['collection-folders'] });
      void queryClient.invalidateQueries({ queryKey: ['navigation-pins'] });
      void queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      void queryClient.refetchQueries({ queryKey: ['library-counts', datasetId] });
    } catch (error) {
      console.error('Failed to refresh sparse grid after folder import', error);
    }
  }, [datasetId, queryClient, refreshAll, requestLoadRange, total]);

  const finalizeFolderProcessing = useCallback(() => {
    setIsProcessingFolder(false);
    setIsFolderDialogOpen(false);
    setActiveFolder(null);
  }, []);

  const handleFolderDecision = useCallback(
    async (mode: FolderUploadMode, options: { collectionName?: string }) => {
      if (!activeFolder) return;

      const defaults = activeFolder.defaults;
      if (!defaults) {
        addNotification({
          type: 'error',
          message: 'Unable to resolve upload defaults for this folder.',
        });
        finalizeFolderProcessing();
        return;
      }

      setIsProcessingFolder(true);
      setIsFolderDialogOpen(false);

      try {
        if (mode === 'flat-upload') {
          setUploadDefaults({
            datasetId: defaults.datasetId,
            mediaType: defaults.mediaType,
            tags: defaults.tags,
            author: defaults.author,
            collectionId: defaults.collectionId,
          });
          addFilesToQueue({ files: activeFolder.files, type: 'new-stack' });
          addNotification({
            type: 'success',
            message: `Queued ${activeFolder.files.length} file(s) from “${activeFolder.name}” for upload.`,
          });
        } else if (mode === 'single-stack') {
          addNotification({
            type: 'info',
            message: `Merging “${activeFolder.name}” into a single stack…`,
          });
          const { stackId, assetIds } = await uploadFolderAsSingleStack(
            activeFolder.files,
            defaults
          );
          await refreshAfterManualUpload();
          addNotification({
            type: 'success',
            message: `Created stack #${stackId} from “${activeFolder.name}” with ${assetIds.length + 1} file(s).`,
          });
        } else if (mode === 'create-collection') {
          const cleanDefaults: FolderUploadDefaults = {
            ...defaults,
            collectionId: undefined,
          };
          const targetName = options.collectionName?.trim() || activeFolder.name;
          addNotification({
            type: 'info',
            message: `Creating collection “${targetName}” from “${activeFolder.name}”…`,
          });
          const { collectionId: createdCollectionId, stackIds } = await uploadFolderAsCollection(
            activeFolder.files,
            cleanDefaults,
            targetName
          );
          await refreshAfterManualUpload();
          addNotification({
            type: 'success',
            message: `Collection “${targetName}” (ID: ${createdCollectionId}) now contains ${stackIds.length} created stack(s).`,
          });
        }
      } catch (error) {
        console.error('Folder import flow failed (sparse grid)', error);
        const message = error instanceof Error ? error.message : 'Folder import failed.';
        addNotification({ type: 'error', message });
      } finally {
        finalizeFolderProcessing();
      }
    },
    [
      activeFolder,
      addFilesToQueue,
      addNotification,
      finalizeFolderProcessing,
      refreshAfterManualUpload,
      setUploadDefaults,
    ]
  );

  const handleFolderCancel = useCallback(() => {
    if (activeFolder) {
      addNotification({
        type: 'info',
        message: `Cancelled import for “${activeFolder.name}”.`,
      });
    }
    finalizeFolderProcessing();
  }, [activeFolder, addNotification, finalizeFolderProcessing]);

  const {
    containerRef,
    infoSidebarOpen,
    setInfoSidebarOpen,
    isSelectionMode,
    selectedItemId,
    selectedItems,
    selectedItemOrder,
    isEditPanelOpen,
    setIsEditPanelOpen,
    itemsPerRow,
    itemSize,
    favoriteStates,
    favoriteOverrides,
    handleItemClick,
    handleToggleSelection,
    selectItemRange,
    handleToggleFavorite,
    handleDeselectAll,
    applyEditUpdates,
    closeEditPanel,
    exitSelectionMode,
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

  // Cmd/Ctrl/Alt + Click はリンクのネイティブ動作へ委譲し、Shift + Click は範囲選択する
  const lastClickedIndexRef = useRef<number | null>(null);

  const onTileClick = useCallback(
    (item: MediaGridItem, e?: React.MouseEvent) => {
      const id = item.id;
      const idx = sparseItems.findIndex((it) => it?.id === id);

      if (e && (e.metaKey || e.ctrlKey)) {
        lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
        return;
      }
      if (e?.altKey) {
        lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
        return;
      }

      if (e?.shiftKey) {
        e.preventDefault();
        setSelectionMode(true);
        const last = lastClickedIndexRef.current ?? idx;
        if (last >= 0 && idx >= 0) {
          const step = last <= idx ? 1 : -1;
          const rangeIds: Array<string | number> = [];
          for (let i = last; step > 0 ? i <= idx : i >= idx; i += step) {
            const it = sparseItems[i];
            if (it) rangeIds.push(it.id);
          }
          selectItemRange(rangeIds);
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
      setSelectionMode,
      handleToggleSelection,
      selectItemRange,
      handleItemClick,
      onItemClick,
    ]
  );

  const selectedStackIdsInOrder = useMemo(() => {
    const stackIds: number[] = [];
    for (const selectedId of selectedItemOrder) {
      const stackId = typeof selectedId === 'string' ? Number.parseInt(selectedId, 10) : selectedId;
      if (Number.isFinite(stackId)) {
        stackIds.push(stackId);
      }
    }
    return stackIds;
  }, [selectedItemOrder]);

  const handleMergeStacks = useCallback(async () => {
    if (selectedStackIdsInOrder.length < 2) return;

    const [targetId, ...sourceIds] = selectedStackIdsInOrder;

    try {
      await apiClient.mergeStacks(targetId, sourceIds);
      handleDeselectAll();
      exitSelectionMode();
      addNotification({
        type: 'success',
        message: `選択順の先頭スタック #${targetId} に ${sourceIds.length} 件をマージしました`,
      });
      await refreshAll();
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['stack'] }),
        queryClient.invalidateQueries({ queryKey: ['stacks'] }),
        queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
        queryClient.invalidateQueries({ queryKey: ['likes', 'yearly'] }),
        queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] }),
      ]);
    } catch (error) {
      console.error('❌ Failed to merge stacks:', error);
      addNotification({ type: 'error', message: 'スタックのマージに失敗しました' });
    }
  }, [
    addNotification,
    datasetId,
    exitSelectionMode,
    handleDeselectAll,
    queryClient,
    refreshAll,
    selectedStackIdsInOrder,
  ]);

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
      if (!files?.length) return;
      const defaults = computeUploadDefaults();
      if (!defaults) {
        addNotification({ type: 'error', message: 'データセットが特定できませんでした' });
        return;
      }

      const { folders, standalone } = splitFilesByTopLevelFolder(files);

      if (standalone.length > 0) {
        setUploadDefaults({
          datasetId: defaults.datasetId,
          mediaType: defaults.mediaType,
          tags: defaults.tags,
          author: defaults.author,
          collectionId: defaults.collectionId,
        });
        addFilesToQueue({ files: standalone, type: 'new-stack' });
      }

      if (folders.length > 0) {
        const requests: FolderImportRequest[] = folders.map((folder: FolderGroup) => ({
          id: folder.id,
          name: folder.name,
          files: folder.files,
          defaults: { ...defaults },
        }));
        setFolderQueue((prev) => [...prev, ...requests]);
      }
    },
    [addFilesToQueue, addNotification, computeUploadDefaults, setUploadDefaults]
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

        const successes = results.filter(
          (result) => result.status === 'created' || result.status === 'added'
        );
        const duplicates = results.filter((result) => result.status === 'skipped');
        const failures = results.filter((result) => result.status === 'error');
        const protectedFailures = failures.filter((failure) =>
          /HTTP 40[13]/.test(failure.message ?? '')
        );

        if (successes.length > 0) {
          addNotification({
            type: 'success',
            message: `${successes.length}件のURLからアップロードしました`,
          });
        }

        if (duplicates.length > 0) {
          addNotification({
            type: 'info',
            message: `${duplicates.length}件のURLは既に取り込み済みのためスキップしました`,
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
              failures.length === results.length
                ? 'URLのアップロードに失敗しました'
                : `${failures.length}件のURLでエラーが発生しました${summary ? `: ${summary}` : ''}`,
          });

          if (protectedFailures.length > 0) {
            addNotification({
              type: 'info',
              message:
                '保護された画像は直接ドロップできません。一度保存してから再度ドロップしてください。',
            });
          }
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
                  selectedItems={selectedItems}
                  selectedStackIdsInOrder={selectedStackIdsInOrder}
                  onMergeStacks={handleMergeStacks}
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

      {activeFolder && (
        <FolderDropDialog
          open={isFolderDialogOpen}
          folderName={activeFolder.name}
          fileCount={activeFolder.files.length}
          onCancel={handleFolderCancel}
          onConfirm={(mode, options) => handleFolderDecision(mode, options)}
        />
      )}

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
            ...(selectedStackIdsInOrder.length >= 2
              ? [
                  {
                    label: 'Merge Stacks',
                    value: 'merge-stacks',
                    onSelect: handleMergeStacks,
                    icon: <GitMerge size={12} />,
                    confirmMessage: `選択順の先頭スタック #${selectedStackIdsInOrder[0]} に残り ${selectedStackIdsInOrder.length - 1} 件をマージします。実行しますか？`,
                    group: 'primary' as const,
                  },
                ]
              : []),
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
