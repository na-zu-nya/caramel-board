import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { Info, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StackGridItem } from '@/components/grid/StackGridItem.tsx';
import { FolderDropDialog } from '@/components/modals/FolderDropDialog.tsx';
import { DropZone } from '@/components/ui/DropZone';
import { GridColumnSlider } from '@/components/ui/GridColumnSlider';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useStackGrid } from '@/hooks/features/useStackGrid';
import { useScratch } from '@/hooks/useScratch';
import { useSparseInfiniteScroll } from '@/hooks/useSparseInfiniteScroll';
import { useStackCollectionMenu } from '@/hooks/useStackCollectionMenu';
import { apiClient } from '@/lib/api-client';
import {
  type FolderGroup,
  type FolderUploadDefaults,
  type FolderUploadMode,
  splitFilesByTopLevelFolder,
  uploadFolderAsCollection,
  uploadFolderAsSingleStack,
} from '@/lib/folder-import';
import { useT } from '@/lib/i18n';
import { getSelectedMediaGridStackIds } from '@/lib/media-grid-selection';
import { applyScrollbarCompensation, removeScrollbarCompensation } from '@/lib/scrollbar-utils';
import { createStackSelectionActions } from '@/lib/stack-selection-actions';
import { cn } from '@/lib/utils';
import { selectionModeAtom } from '@/stores/ui';
import {
  addFilesToQueueAtom,
  addUploadNotificationAtom,
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

const EMPTY_SELECTED_STACK_IDS: number[] = [];

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
  const t = useT();
  const queryClient = useQueryClient();
  const setSelectionMode = useSetAtom(selectionModeAtom);
  const addFilesToQueue = useSetAtom(addFilesToQueueAtom);
  const addNotification = useSetAtom(addUploadNotificationAtom);
  const uploadNotifications = useAtomValue(uploadNotificationsAtom);
  const { ensureScratch } = useScratch(datasetId);
  const {
    collections: collectionMenuCollections,
    isLoadingCollections: isCollectionMenuLoading,
    addStackIdsToCollection,
    openCreateCollectionForStackIds,
    createCollectionModal,
  } = useStackCollectionMenu(datasetId);

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

    const collectionMatch = window.location.pathname.match(/(?:collections|scratch)\/(\d+)/);
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
          message: t.upload.unableToResolveFolderDefaults,
        });
        finalizeFolderProcessing();
        return;
      }

      setIsProcessingFolder(true);
      setIsFolderDialogOpen(false);

      try {
        if (mode === 'flat-upload') {
          addFilesToQueue({
            files: activeFolder.files,
            type: 'new-stack',
            metadata: defaults,
          });
          addNotification({
            type: 'success',
            message: t.upload.queuedFiles(activeFolder.files.length, activeFolder.name),
          });
        } else if (mode === 'single-stack') {
          addNotification({
            type: 'info',
            message: t.upload.mergingFolder(activeFolder.name),
          });
          const { stackId, assetIds } = await uploadFolderAsSingleStack(
            activeFolder.files,
            defaults
          );
          await refreshAfterManualUpload();
          addNotification({
            type: 'success',
            message: t.upload.createdStackFromFolder(
              stackId,
              activeFolder.name,
              assetIds.length + 1
            ),
          });
        } else if (mode === 'create-collection') {
          const cleanDefaults: FolderUploadDefaults = {
            ...defaults,
            collectionId: undefined,
          };
          const targetName = options.collectionName?.trim() || activeFolder.name;
          addNotification({
            type: 'info',
            message: t.upload.creatingCollectionFromFolder(targetName, activeFolder.name),
          });
          const { collectionId: createdCollectionId, stackIds } = await uploadFolderAsCollection(
            activeFolder.files,
            cleanDefaults,
            targetName
          );
          await refreshAfterManualUpload();
          addNotification({
            type: 'success',
            message: t.upload.collectionCreatedFromFolder(
              targetName,
              createdCollectionId,
              stackIds.length
            ),
          });
        }
      } catch (error) {
        console.error('Folder import flow failed (sparse grid)', error);
        const message = error instanceof Error ? error.message : t.grid.folderImportFailed;
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
      t,
    ]
  );

  const handleFolderCancel = useCallback(() => {
    if (activeFolder) {
      addNotification({
        type: 'info',
        message: t.upload.cancelledFolderImport(activeFolder.name),
      });
    }
    finalizeFolderProcessing();
  }, [activeFolder, addNotification, finalizeFolderProcessing, t]);

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
    rangeStart,
    rangeEnd,
    setGridColumns,
    favoriteStates,
    favoriteOverrides,
    handleItemClick,
    handleToggleSelection,
    selectItemRange,
    handleToggleFavorite,
    handleDeselectAll,
    clearSelection,
    applyEditUpdates,
    closeEditPanel,
    exitSelectionMode,
    isSidebarAnimating,
  } = useStackGrid({
    items: sparseItems,
    total,
    hasMore: false, // Not used in sparse mode
    isLoading,
    error: null,
    onItemClick,
    onRefreshAll: refreshAll,
  });

  const selectedBulkEditItems = useMemo(
    () =>
      Array.from(selectedItems)
        .map((id) => sparseItems.find((item) => item?.id === id))
        .filter((item): item is MediaGridItem => item !== undefined),
    [selectedItems, sparseItems]
  );

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
        if (!isSelectionMode) {
          setSelectionMode(true);
          clearSelection();
          handleToggleSelection(id);
          lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
          return;
        }

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
      isSelectionMode,
      setSelectionMode,
      handleToggleSelection,
      selectItemRange,
      clearSelection,
      handleItemClick,
      onItemClick,
    ]
  );

  const selectedStackIdsInOrder = useMemo(() => {
    if (selectedItemOrder.length === 0) return EMPTY_SELECTED_STACK_IDS;
    return getSelectedMediaGridStackIds(selectedItemOrder, sparseItems);
  }, [selectedItemOrder, sparseItems]);

  const visibleGridEntries = useMemo(() => {
    const start = Math.max(0, Math.min(rangeStart, total));
    const end = Math.max(start, Math.min(rangeEnd, total));
    const entries: Array<{ index: number; item: MediaGridItem | undefined }> = [];

    for (let index = start; index < end; index++) {
      entries.push({ index, item: sparseItems[index] });
    }

    return entries;
  }, [rangeStart, rangeEnd, sparseItems, total]);

  const handleMergeStacks = useCallback(async () => {
    if (selectedStackIdsInOrder.length < 2) return;

    const [targetId, ...sourceIds] = selectedStackIdsInOrder;

    try {
      await apiClient.mergeStacks(targetId, sourceIds);
      handleDeselectAll();
      exitSelectionMode();
      addNotification({
        type: 'success',
        message: t.grid.mergeSelectedSuccess(targetId, sourceIds.length),
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
      addNotification({ type: 'error', message: t.grid.mergeSelectedFailed });
    }
  }, [
    addNotification,
    datasetId,
    exitSelectionMode,
    handleDeselectAll,
    queryClient,
    refreshAll,
    selectedStackIdsInOrder,
    t,
  ]);

  const handleAddStackToScratch = useCallback(
    async (id: string | number) => {
      const scratchCollection = await ensureScratch();
      const stackId = typeof id === 'string' ? Number.parseInt(id, 10) : id;
      if (!Number.isFinite(stackId)) return;

      await apiClient.addStackToCollection(scratchCollection.id, stackId);
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      await queryClient.refetchQueries({ queryKey: ['library-counts', datasetId] });
    },
    [datasetId, ensureScratch, queryClient]
  );

  const handleRefreshStacks = useCallback(
    async (stackIds: Array<string | number>) => {
      if (stackIds.length === 0) return;

      try {
        await apiClient.refreshStacks(stackIds);
        handleDeselectAll();
        exitSelectionMode();
        await refreshAll();
        void Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ['stack'] }),
          queryClient.invalidateQueries({ queryKey: ['stacks'] }),
          queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
          queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] }),
        ]);
      } catch (error) {
        console.error('❌ Failed to refresh stacks:', error);
        addNotification({ type: 'error', message: t.grid.refreshFailed });
      }
    },
    [addNotification, datasetId, exitSelectionMode, handleDeselectAll, queryClient, refreshAll, t]
  );

  const selectionActions = useMemo(
    () =>
      createStackSelectionActions({
        selectedCount: selectedItems.size,
        copy: {
          bulkEdit: t.grid.bulkEdit,
          downloadSelected: t.contextMenu.downloadSelected,
          mergeStacks: t.grid.mergeStacks,
          refresh: t.grid.refresh,
          deleteStacks: t.grid.deleteStacks,
          deleteStacksConfirm: t.grid.deleteStacksConfirm,
        },
        bulkEdit: { onSelect: () => setIsEditPanelOpen((prev) => !prev) },
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
        refresh: {
          onSelect: () => handleRefreshStacks(selectedStackIdsInOrder),
        },
      }),
    [
      handleMergeStacks,
      handleRefreshStacks,
      selectedItems.size,
      selectedStackIdsInOrder,
      setIsEditPanelOpen,
      t,
    ]
  );

  // Handle scroll-based loading
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || isSidebarAnimating) return;

    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;

    // Calculate visible area
    const visibleTop = scrollTop;
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

  useEffect(() => {
    handleScroll();
  }, [handleScroll]);

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
        addNotification({ type: 'error', message: t.grid.datasetNotFound });
        return;
      }

      const { folders, standalone } = splitFilesByTopLevelFolder(files);

      if (standalone.length > 0) {
        addFilesToQueue({ files: standalone, type: 'new-stack', metadata: defaults });
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
    [addFilesToQueue, addNotification, computeUploadDefaults, t]
  );

  const handleUrlDrop = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return;

      const datasetNumericId = dataset?.id ? Number(dataset.id) : Number(datasetId);
      if (Number.isNaN(datasetNumericId)) {
        addNotification({ type: 'error', message: t.grid.datasetNotFound });
        return;
      }

      const collectionMatch = window.location.pathname.match(/(?:collections|scratch)\/(\d+)/);
      const collectionId = collectionMatch ? Number.parseInt(collectionMatch[1], 10) : undefined;
      const targetMediaType = collectionId ? 'image' : mediaType || undefined;

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
            message: t.grid.urlUploaded(successes.length),
          });
        }

        if (duplicates.length > 0) {
          addNotification({
            type: 'info',
            message: t.grid.urlDuplicatesSkipped(duplicates.length),
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
                ? t.grid.urlUploadFailed
                : t.grid.urlUploadPartialFailed(failures.length, summary),
          });

          if (protectedFailures.length > 0) {
            addNotification({
              type: 'info',
              message: t.grid.protectedImageDropHint,
            });
          }
        }
      } catch (error) {
        console.error('Failed to import URLs for sparse grid', error);
        addNotification({ type: 'error', message: t.grid.urlUploadFailed });
      }
    },
    [dataset?.id, datasetId, mediaType, addNotification, t]
  );

  // Loading state
  if (isLoading && sparseItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{t.common.loading}</span>
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
          {emptyState?.title || t.grid.noStacksFound}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          {emptyState?.description || t.emptyState.uploadImagesDescription}
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
          'h-full overflow-y-scroll overscroll-contain transition-[padding] duration-300 ease-in-out',
          infoSidebarOpen ? 'pr-80' : 'pr-0'
        )}
        style={{ scrollbarGutter: 'stable' }}
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
          {visibleGridEntries.map(({ item, index }) => {
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
                {item ? (
                  <StackGridItem
                    item={item}
                    isSelected={selectedItems.has(item.id)}
                    isInfoSelected={selectedItemId === item.id}
                    isSelectionMode={isSelectionMode}
                    isFavoritePending={favoriteStates.has(item.id)}
                    overrideFavorited={favoriteOverrides.get(item.id)}
                    datasetId={datasetId}
                    onItemClick={onTileClick}
                    onToggleSelection={handleToggleSelection}
                    onToggleFavorite={handleToggleFavorite}
                    selectedItems={selectedItems}
                    selectedStackIdsInOrder={selectedStackIdsInOrder}
                    onMergeStacks={handleMergeStacks}
                    onRefreshStacks={handleRefreshStacks}
                    collectionMenuCollections={collectionMenuCollections}
                    isCollectionMenuLoading={isCollectionMenuLoading}
                    onAddStacksToCollection={addStackIdsToCollection}
                    onCreateCollectionWithStacks={openCreateCollectionForStackIds}
                    onAddToScratch={handleAddStackToScratch}
                  />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
            );
          })}
        </div>

        {/* Upload notifications */}
        {uploadNotifications.map((notification) => {
          const progress =
            'progress' in notification && typeof notification.progress === 'number'
              ? notification.progress
              : undefined;

          return (
            <div
              key={notification.id}
              className="fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[120] rounded-lg bg-blue-500 p-3 text-white shadow-lg sm:left-auto sm:right-4 sm:w-80 lg:bottom-4 lg:w-96 lg:p-4"
            >
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span className="min-w-0 text-xs font-medium leading-snug lg:text-sm">
                  {notification.message}
                </span>
              </div>
              {progress !== undefined && (
                <div className="mt-2 h-2 w-full rounded-full bg-blue-400">
                  <div
                    className="h-2 rounded-full bg-white transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
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

      {createCollectionModal}

      {/* Selection Action Bar */}
      {isSelectionMode && selectedItems.size > 0 && (
        <SelectionActionBar
          selectedCount={selectedItems.size}
          onClearSelection={handleDeselectAll}
          onExitSelectionMode={() => setSelectionMode(false)}
          actions={selectionActions}
        />
      )}

      {/* Info Sidebar Toggle */}
      <HeaderIconButton
        aria-label={infoSidebarOpen ? t.viewer.closeInfo : t.viewer.openInfo}
        onClick={() => setInfoSidebarOpen(!infoSidebarOpen)}
        className={cn(
          'fixed top-4 right-4 z-50 transition-colors',
          infoSidebarOpen ? 'bg-blue-500 text-white' : 'text-white hover:bg-white/20'
        )}
      >
        <Info size={18} />
      </HeaderIconButton>

      {createPortal(
        <GridColumnSlider
          value={itemsPerRow}
          className={cn(infoSidebarOpen || isEditPanelOpen ? 'right-[21.25rem]' : 'right-5')}
          onChange={setGridColumns}
        />,
        document.body
      )}

      {/* Info Sidebar moved to root for persistent mounting */}

      {isEditPanelOpen &&
        createPortal(
          <BulkEditPanel
            isOpen={isEditPanelOpen}
            selectedItems={selectedItems}
            onClose={closeEditPanel}
            onSave={applyEditUpdates}
            items={selectedBulkEditItems}
          />,
          document.body
        )}
    </DropZone>
  );
}
