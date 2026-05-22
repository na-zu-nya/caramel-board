import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { Clapperboard, GitMerge, Info, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StackGridItem } from '@/components/grid/StackGridItem.tsx';
import { FolderDropDialog } from '@/components/modals/FolderDropDialog.tsx';
import { DropZone } from '@/components/ui/DropZone';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useStackGrid } from '@/hooks/features/useStackGrid';
import { useScratch } from '@/hooks/useScratch';
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
import { currentFilterAtom, reorderModeAtom, selectionModeAtom } from '@/stores/ui';
import {
  addFilesToQueueAtom,
  addUploadNotificationAtom,
  uploadDefaultsAtom,
  uploadNotificationsAtom,
} from '@/stores/upload';
import type { Dataset, MediaGridItem } from '@/types';
import BulkEditPanel from './BulkEditPanel.tsx';

interface StackGridProps {
  // Option 1: Legacy mode with pre-loaded items array
  items?: (MediaGridItem | undefined)[];
  total?: number;
  hasMore?: boolean;
  isLoading?: boolean;
  error?: Error | null;
  onLoadRange?: (startIndex: number, endIndex: number) => void;
  onRefreshAll?: () => Promise<void>;
  onReorderStacks?: (sourceIndex: number, targetIndex: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  useWindowScroll?: boolean;

  // Common props
  dataset?: Dataset;
  emptyState?: {
    icon: string;
    title: string;
    description: string;
  };
  onItemClick?: (item: MediaGridItem) => void;
  className?: string;
  allowRemoveFromCollection?: boolean;
  // Scratch support
  allowRemoveFromScratch?: boolean;
  scratchCollectionId?: string | number;
}

interface FolderImportRequest {
  id: string;
  name: string;
  files: File[];
  defaults: FolderUploadDefaults;
}

export default function StackGrid({
  // Legacy mode props
  items,
  total: legacyTotal = 0,
  hasMore = false,
  isLoading: legacyIsLoading = false,
  error = null,
  onLoadRange,
  onRefreshAll: legacyOnRefreshAll,
  containerRef: externalContainerRef,

  // Common props
  dataset,
  emptyState,
  onItemClick,
  className,
  useWindowScroll = true,
  allowRemoveFromCollection = false,
  allowRemoveFromScratch = false,
  scratchCollectionId,
}: StackGridProps) {
  const queryClient = useQueryClient();
  const currentFilter = useAtomValue(currentFilterAtom);
  const dsId = dataset?.id ? String(dataset.id) : String((currentFilter as any)?.datasetId || '1');
  const { scratch } = useScratch(dsId);
  const setSelectionMode = useSetAtom(selectionModeAtom);
  const reorderMode = useAtomValue(reorderModeAtom);
  const addFilesToQueue = useSetAtom(addFilesToQueueAtom);
  const setUploadDefaults = useSetAtom(uploadDefaultsAtom);
  const addNotification = useSetAtom(addUploadNotificationAtom);
  const uploadNotifications = useAtomValue(uploadNotificationsAtom);

  // Legacy mode normalization for downstream hooks/utilities
  const actualItems = items || [];
  const actualTotal = legacyTotal;
  const actualIsLoading = legacyIsLoading;
  const actualOnRefreshAll = legacyOnRefreshAll;

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
    const datasetNumericId = dataset?.id ? Number(dataset.id) : Number.parseInt(dsId, 10);
    if (!Number.isFinite(datasetNumericId)) {
      console.error('Failed to resolve dataset ID for folder import', dataset, dsId);
      return null;
    }

    const currentAuthor =
      Array.isArray(currentFilter.authors) && currentFilter.authors.length > 0
        ? currentFilter.authors[0]
        : undefined;

    let targetMediaType = currentFilter.mediaType || undefined;
    const collectionMatch = window.location.pathname.match(/(?:collections|scratch)\/(\d+)/);
    const inCollectionView = Boolean(collectionMatch);
    const collectionId = collectionMatch ? Number.parseInt(collectionMatch[1], 10) : undefined;
    if (inCollectionView) {
      targetMediaType = 'image';
    }

    return {
      datasetId: datasetNumericId,
      mediaType: targetMediaType,
      tags: currentFilter.tags,
      author: currentAuthor,
      collectionId,
    };
  }, [currentFilter, dataset?.id, dsId, dataset]);

  // While this grid is mounted, stabilize body scrollbar gutter for contextmenu reflows
  useEffect(() => {
    applyScrollbarCompensation();
    return () => {
      removeScrollbarCompensation();
    };
  }, []);

  // Initialize upload queue processing

  const {
    containerRef: internalContainerRef,
    sidebarOpen,
    infoSidebarOpen,
    setInfoSidebarOpen,
    isSelectionMode,
    selectedItemId,
    selectedItems,
    selectedItemOrder,
    isEditPanelOpen,
    setIsEditPanelOpen,
    finalVisibleItems,
    topSpacerHeight,
    bottomSpacerHeight,
    itemSize,
    itemsPerRow,
    favoriteStates,
    favoriteOverrides,
    handleItemClick,
    handleToggleSelection,
    selectItemRange,
    handleToggleFavorite,
    clearSelection,
    exitSelectionMode,
    closeEditPanel,
    applyEditUpdates,
    onRefreshAll,
    rangeStart,
  } = useStackGrid({
    items: actualItems, // Don't filter out undefined - we need sparse array
    total: actualTotal,
    hasMore,
    isLoading: actualIsLoading,
    error,
    onLoadRange,
    onRefreshAll: actualOnRefreshAll,
    onItemClick,
    containerRef: externalContainerRef,
    useWindowScroll,
  });

  // Use external containerRef if provided, otherwise use internal
  const containerRef = externalContainerRef || internalContainerRef;

  // Wrap handleItemClick with onItemClick parameter
  const lastClickedIndexRef = useRef<number | null>(null);

  const findIndexById = useCallback(
    (id: string | number) => {
      for (let i = 0; i < actualItems.length; i++) {
        const it = actualItems[i];
        if (!it) continue;
        const itId = typeof it.id === 'string' ? it.id : String(it.id);
        if (itId === (typeof id === 'string' ? id : String(id))) return i;
      }
      return -1;
    },
    [actualItems]
  );

  const onTileClick = useCallback(
    (item: MediaGridItem, e?: React.MouseEvent) => {
      const id = item.id;
      const idx = findIndexById(id);

      // Cmd/Ctrl/Alt + Click はリンクのネイティブ動作へ委譲する
      if (e && (e.metaKey || e.ctrlKey)) {
        lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
        return;
      }
      if (e?.altKey) {
        lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
        return;
      }

      // Shift + Click → range select from last clicked
      if (e?.shiftKey) {
        e.preventDefault();
        setSelectionMode(true);
        const last = lastClickedIndexRef.current ?? idx;
        if (last >= 0 && idx >= 0) {
          const step = last <= idx ? 1 : -1;
          const rangeIds: Array<string | number> = [];
          for (let i = last; step > 0 ? i <= idx : i >= idx; i += step) {
            const it = actualItems[i];
            if (it) rangeIds.push(it.id);
          }
          selectItemRange(rangeIds);
        } else {
          handleToggleSelection(id);
        }
        lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
        return;
      }

      // Normal click → remember anchor then delegate to default handler
      lastClickedIndexRef.current = idx >= 0 ? idx : lastClickedIndexRef.current;
      handleItemClick(item, onItemClick);
    },
    [
      actualItems,
      setSelectionMode,
      handleToggleSelection,
      selectItemRange,
      handleItemClick,
      onItemClick,
      findIndexById,
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

  // Track processed notification IDs to avoid duplicate refreshes
  const processedNotificationIds = useRef<Set<string>>(new Set());
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen to merge events to refresh immediately
  useEffect(() => {
    const handler = async (e: Event) => {
      console.log('🔄 stacks-merged event received', e);
      try {
        if (onRefreshAll) {
          await onRefreshAll();
          if (onLoadRange) {
            const start = rangeStart || 0;
            const endIndex = Math.min(start + 100, actualTotal - 1);
            console.log(`📥 Reloading after merge (${start} to ${endIndex})`);
            onLoadRange(start, endIndex);
          }
        } else {
          void queryClient.invalidateQueries({ queryKey: ['stacks'] });
        }
      } catch (err) {
        console.error('Failed to refresh after merge', err);
      }
    };

    window.addEventListener('stacks-merged', handler as EventListener);
    return () => window.removeEventListener('stacks-merged', handler as EventListener);
  }, [onRefreshAll, onLoadRange, rangeStart, actualTotal, queryClient]);

  // Listen for upload completion notifications and refresh data
  useEffect(() => {
    const successNotifications = uploadNotifications.filter(
      (n) =>
        n.type === 'success' &&
        n.message.includes('アップロード') &&
        !processedNotificationIds.current.has(n.id)
    );

    if (successNotifications.length > 0) {
      // Mark these notifications as processed
      for (const n of successNotifications) {
        processedNotificationIds.current.add(n.id);
      }

      console.log(
        `🔄 Upload completed (${successNotifications.length} files), scheduling refresh...`
      );

      // Clear any existing timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      // Debounce the refresh to handle batch uploads
      refreshTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Executing refresh now...');

        // Use refreshAll if available for better cache management
        if (onRefreshAll) {
          onRefreshAll().then(() => {
            // After refresh, reload from the beginning to see new items
            if (onLoadRange) {
              // Load first 100 items to show new uploads at the top
              const endIndex = Math.min(99, actualTotal);
              console.log(`📥 Reloading from beginning (0 to ${endIndex}) to show new uploads`);
              onLoadRange(0, endIndex);

              // Scroll to top to show new items (window scroll)
              window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            }

            // Also refresh sidebar menu counts (collections, folders)
            void queryClient.invalidateQueries({ queryKey: ['collection-folders'] });
            void queryClient.invalidateQueries({ queryKey: ['navigation-pins'] });
            void queryClient.invalidateQueries({ queryKey: ['library-counts', dsId] });
            void queryClient.refetchQueries({ queryKey: ['library-counts', dsId] });
          });
        } else {
          // Fallback: Invalidate all stack-related queries
          void queryClient.invalidateQueries({ queryKey: ['stacks'] });
          void queryClient.invalidateQueries({ queryKey: ['collection-folders'] });
          void queryClient.invalidateQueries({ queryKey: ['navigation-pins'] });
          void queryClient.invalidateQueries({ queryKey: ['library-counts', dsId] });
          void queryClient.refetchQueries({ queryKey: ['library-counts', dsId] });

          // Force re-fetch the current page data
          if (onLoadRange && actualTotal > 0) {
            const currentIndex = rangeStart || 0;
            const endIndex = Math.min(currentIndex + 100, actualTotal - 1);
            console.log(`📥 Reloading range ${currentIndex} to ${endIndex}`);
            onLoadRange(currentIndex, endIndex);
          }
        }
      }, 500); // Wait 500ms to batch multiple uploads
    }
  }, [uploadNotifications, queryClient, onLoadRange, onRefreshAll, rangeStart, actualTotal, dsId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  // Handle remove from collection
  const handleRemoveFromCollection = async (itemIds: (string | number)[]) => {
    try {
      console.log('Removing from collection:', itemIds);
      // Retrieve collection ID from current route
      const collectionId = window.location.pathname.match(/collections\/(\d+)/)?.[1];

      if (!collectionId) {
        console.error('Collection ID not found');
        return;
      }

      for (const itemId of itemIds) {
        const stackId = typeof itemId === 'string' ? Number.parseInt(itemId, 10) : itemId;
        await apiClient.removeStackFromCollection(collectionId, stackId);
      }

      // Clear selection and exit selection mode after successful removal
      selectedItems.clear();
      setSelectionMode(false);

      // Refresh the data
      console.log('🔄 Refreshing after collection removal...');
      if (onRefreshAll) {
        await onRefreshAll();
        // Reload current view
        if (onLoadRange && rangeStart !== undefined) {
          const endIndex = Math.min(rangeStart + 100, actualTotal - itemIds.length);
          console.log(`📥 Reloading after collection removal (${rangeStart} to ${endIndex})`);
          onLoadRange(rangeStart, endIndex);
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ['stacks'] });
      }

      if (scratch && String(collectionId) === String(scratch.id)) {
        await queryClient.invalidateQueries({ queryKey: ['library-counts', dsId] });
      }

      console.log('✅ Items removed from collection successfully');
    } catch (error) {
      console.error('❌ Failed to remove from collection:', error);
    }
  };

  // Handle remove from scratch (single)
  const handleRemoveFromScratchSingle = async (id: string | number) => {
    try {
      const collectionId =
        scratchCollectionId ?? window.location.pathname.match(/scratch\/(\d+)/)?.[1];
      if (!collectionId) return;
      const stackId = typeof id === 'string' ? Number.parseInt(id, 10) : id;
      await apiClient.removeStackFromCollection(collectionId, stackId);
      if (onRefreshAll) await onRefreshAll();
      else void queryClient.invalidateQueries({ queryKey: ['stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['library-counts', dsId] });
    } catch (error) {
      console.error('❌ Failed to remove from scratch:', error);
    }
  };

  const handleRefreshThumbnails = async (itemIds: (string | number)[]) => {
    if (itemIds.length === 0) return;

    try {
      const stackIds = itemIds.map((id) => (typeof id === 'string' ? Number.parseInt(id, 10) : id));
      await apiClient.bulkRefreshThumbnails(stackIds);

      clearSelection();
      exitSelectionMode();

      if (onRefreshAll) {
        await onRefreshAll();
        if (onLoadRange && rangeStart !== undefined) {
          const endIndex = Math.min(rangeStart + 100, actualTotal);
          onLoadRange(rangeStart, endIndex);
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ['stacks'] });
      }
    } catch (error) {
      console.error('❌ Failed to refresh thumbnails:', error);
      alert('Failed to refresh thumbnails. Please try again.');
    }
  };

  const handleOptimizePreviews = async () => {
    if (selectedItems.size === 0) return;

    const stackIds = Array.from(selectedItems).map((id) =>
      typeof id === 'string' ? Number.parseInt(id, 10) : id
    );

    try {
      for (const stackId of stackIds) {
        await apiClient.regenerateStackPreview({ stackId, datasetId: dsId, force: true });
      }

      clearSelection();
      exitSelectionMode();

      if (onRefreshAll) {
        await onRefreshAll();
        if (onLoadRange && rangeStart !== undefined) {
          const endIndex = Math.min(rangeStart + 100, actualTotal);
          onLoadRange(rangeStart, endIndex);
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ['stacks'] });
      }
    } catch (error) {
      console.error('❌ Failed to optimize video previews:', error);
      alert('Failed to optimize video previews. Please try again.');
    }
  };

  const handleMergeStacks = useCallback(async () => {
    if (selectedStackIdsInOrder.length < 2) return;

    const [targetId, ...sourceIds] = selectedStackIdsInOrder;

    try {
      await apiClient.mergeStacks(targetId, sourceIds);

      clearSelection();
      exitSelectionMode();

      addNotification({
        type: 'success',
        message: `選択順の先頭スタック #${targetId} に ${sourceIds.length} 件をマージしました`,
      });

      window.dispatchEvent(new CustomEvent('stacks-merged', { detail: { targetId, sourceIds } }));

      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['stack'] }),
        queryClient.invalidateQueries({ queryKey: ['stacks'] }),
        queryClient.invalidateQueries({ queryKey: ['library-counts', dsId] }),
        queryClient.invalidateQueries({ queryKey: ['likes', 'yearly'] }),
        queryClient.invalidateQueries({ queryKey: ['dataset-overview', dsId] }),
      ]);
    } catch (error) {
      console.error('❌ Failed to merge stacks:', error);
      addNotification({ type: 'error', message: 'スタックのマージに失敗しました' });
    }
  }, [
    addNotification,
    clearSelection,
    dsId,
    exitSelectionMode,
    queryClient,
    selectedStackIdsInOrder,
  ]);

  // Handle bulk delete stacks
  const handleRemoveStacks = async (itemIds: (string | number)[]) => {
    try {
      console.log('🗑️ Deleting stacks:', itemIds);

      if (itemIds.length === 0) return;

      // Use bulk delete if multiple items, otherwise single delete
      if (itemIds.length > 1) {
        const result = await apiClient.bulkRemoveStacks(itemIds);
        console.log(`✅ Bulk delete result: ${result.removed} stacks removed`);
        if (result.errors && result.errors.length > 0) {
          console.error('❌ Some deletions failed:', result.errors);
        }
      } else {
        await apiClient.removeStack(itemIds[0]);
        console.log('✅ Stack deleted successfully');
      }

      // Clear selection and exit selection mode after successful deletion
      clearSelection();
      exitSelectionMode();

      // Refresh the data
      console.log('🔄 Refreshing after stack deletion...');
      if (onRefreshAll) {
        await onRefreshAll();
        // Reload current view
        if (onLoadRange && rangeStart !== undefined) {
          const endIndex = Math.min(rangeStart + 100, actualTotal - itemIds.length);
          console.log(`📥 Reloading after deletion (${rangeStart} to ${endIndex})`);
          onLoadRange(rangeStart, endIndex);
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ['stacks'] });
        void queryClient.invalidateQueries({ queryKey: ['library-counts', dsId] });
      }

      console.log('✅ Stack deletion completed');
    } catch (error) {
      console.error('❌ Failed to delete stacks:', error);
      alert('Failed to delete stacks. Please try again.');
    }
  };

  const refreshAfterManualUpload = useCallback(async () => {
    try {
      if (onRefreshAll) {
        await onRefreshAll();
        if (onLoadRange && rangeStart !== undefined) {
          const endIndex = Math.min(rangeStart + 100, actualTotal);
          onLoadRange(rangeStart, endIndex);
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ['stacks'] });
      }

      void queryClient.invalidateQueries({ queryKey: ['collection-folders'] });
      void queryClient.invalidateQueries({ queryKey: ['navigation-pins'] });
      void queryClient.invalidateQueries({ queryKey: ['library-counts', dsId] });
      void queryClient.refetchQueries({ queryKey: ['library-counts', dsId] });
    } catch (error) {
      console.error('Failed to refresh after folder import', error);
    }
  }, [actualTotal, dsId, onLoadRange, onRefreshAll, queryClient, rangeStart]);

  const finalizeFolderProcessing = useCallback(() => {
    setIsProcessingFolder(false);
    setIsFolderDialogOpen(false);
    setActiveFolder(null);
  }, []);

  const handleFolderDecision = useCallback(
    async (mode: FolderUploadMode, options: { collectionName?: string }) => {
      if (!activeFolder) {
        return;
      }

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
          const { collectionId, stackIds } = await uploadFolderAsCollection(
            activeFolder.files,
            cleanDefaults,
            targetName
          );
          await refreshAfterManualUpload();
          addNotification({
            type: 'success',
            message: `Collection “${targetName}” (ID: ${collectionId}) now contains ${stackIds.length} created stack(s).`,
          });
        }
      } catch (error) {
        console.error('Folder import flow failed', error);
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

  // Check if we're in a collection view
  const _isCollectionView = window.location.pathname.includes('/collections/');
  const _isScratchView = window.location.pathname.includes('/scratch/');

  // Handle file drops for new stack creation
  const handleFileDrop = useCallback(
    (files: File[]) => {
      if (!files?.length) return;
      console.log('Files dropped for new stack creation:', files);
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

      const datasetNumericId = dataset?.id ? Number(dataset.id) : Number(dsId);
      if (Number.isNaN(datasetNumericId)) {
        addNotification({ type: 'error', message: 'データセットが特定できませんでした' });
        return;
      }

      const currentAuthor =
        Array.isArray(currentFilter.authors) && currentFilter.authors.length > 0
          ? currentFilter.authors[0]
          : undefined;

      let targetMediaType = currentFilter.mediaType || undefined;
      const collectionMatch = window.location.pathname.match(/(?:collections|scratch)\/(\d+)/);
      const inCollectionView = Boolean(collectionMatch);
      const collectionId = collectionMatch ? Number.parseInt(collectionMatch[1], 10) : undefined;
      if (inCollectionView) {
        targetMediaType = 'image';
      }

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
          author: currentAuthor,
          tags: currentFilter.tags,
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
        console.error('Failed to import URLs for new stack', error);
        addNotification({ type: 'error', message: 'URLのアップロードに失敗しました' });
      }
    },
    [dataset?.id, dsId, currentFilter, addNotification]
  );

  // Show loading only for absolute initial load (when no items exist and no total count)
  // Avoid showing loading screen during data transitions
  if (actualIsLoading && actualItems.length === 0 && actualTotal === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && actualItems.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load items</p>
          <p className="text-gray-400 text-sm">Please try again later</p>
        </div>
      </div>
    );
  }

  // Empty state is now handled inside the main render to ensure DropZone is active

  return (
    <DropZone
      onDrop={handleFileDrop}
      onUrlDrop={handleUrlDrop}
      className="min-h-screen"
      overlayClassName={cn(
        'fixed z-50 pointer-events-none',
        sidebarOpen ? 'left-80' : 'left-0',
        infoSidebarOpen || isEditPanelOpen ? 'right-80' : 'right-0',
        'top-14 bottom-0' // Exclude header height
      )}
    >
      <div
        ref={containerRef}
        className={cn(
          'relative transition-all duration-300 ease-in-out bg-gray-50',
          // 右側の情報パネル分の余白のみ確保（左は__rootで調整）
          infoSidebarOpen || isEditPanelOpen ? 'mr-80' : 'mr-0',
          className
        )}
        style={{ minHeight: '100vh' }}
      >
        {/* Reorder mode indicator */}
        {reorderMode && (
          <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-30">
            <div className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm flex items-center gap-2 shadow-lg">
              <span className="text-lg">↕</span>
              Reorder Mode - Drag items to rearrange
            </div>
          </div>
        )}

        {/* Virtual scrolling container */}
        <div
          style={{
            minHeight: Math.max(
              (finalVisibleItems?.length || 0) * itemSize + 56,
              window.innerHeight - 56
            ),
          }}
        >
          {/* Top spacer */}
          {topSpacerHeight > 0 && (
            <div data-name="top-spacer" style={{ height: topSpacerHeight }} />
          )}

          {/* Visible items grid */}
          <div
            className="grid gap-0"
            style={{
              gridTemplateColumns: `repeat(${itemsPerRow}, 1fr)`,
            }}
          >
            {(finalVisibleItems || []).map((item, index) => {
              const actualIndex = (rangeStart || 0) + index;

              if (!item) {
                // Show white placeholder for unloaded items
                return <div key={`placeholder-${actualIndex}`} className="aspect-square" />;
              }

              const isSelected = selectedItems.has(item.id);
              const isInfoSelected = infoSidebarOpen && selectedItemId === item.id;

              return (
                <StackGridItem
                  key={item.id}
                  item={item}
                  isSelected={isSelected}
                  isInfoSelected={isInfoSelected}
                  isSelectionMode={isSelectionMode}
                  isFavoritePending={favoriteStates.has(item.id)}
                  overrideFavorited={favoriteOverrides.get(item.id)}
                  selectedItems={selectedItems}
                  onItemClick={onTileClick}
                  onToggleSelection={handleToggleSelection}
                  onToggleFavorite={handleToggleFavorite}
                  allowRemoveFromCollection={allowRemoveFromCollection}
                  selectedStackIdsInOrder={selectedStackIdsInOrder}
                  onMergeStacks={handleMergeStacks}
                  onRemoveFromCollection={
                    allowRemoveFromCollection ? (id) => handleRemoveFromCollection([id]) : undefined
                  }
                  allowRemoveFromScratch={allowRemoveFromScratch}
                  onRemoveFromScratch={
                    allowRemoveFromScratch ? handleRemoveFromScratchSingle : undefined
                  }
                />
              );
            })}
          </div>

          {/* Bottom spacer */}
          {bottomSpacerHeight > 0 && (
            <div data-name="bottom-spacer" style={{ height: bottomSpacerHeight }} />
          )}
        </div>

        {/* Loading indicator for more items */}
        {actualIsLoading && hasMore && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {/* Background loading indicator when refreshing existing content */}
        {actualIsLoading && actualItems.length > 0 && (
          <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-30">
            <div className="bg-black/80 text-white px-3 py-1 rounded-md text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating...
            </div>
          </div>
        )}

        {/* Empty state - show when we have no items */}
        {actualTotal === 0 && !actualIsLoading && emptyState && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <span className="text-6xl mb-4 block">{emptyState.icon}</span>
              <p className="text-gray-300 mb-2">{emptyState.title}</p>
              <p className="text-sm text-gray-400">{emptyState.description}</p>
            </div>
          </div>
        )}
      </div>

      {/* Edit Panel */}
      {isEditPanelOpen &&
        createPortal(
          <BulkEditPanel
            isOpen={isEditPanelOpen}
            selectedItems={selectedItems}
            onClose={closeEditPanel}
            onSave={applyEditUpdates}
            items={actualItems.filter((item): item is MediaGridItem => item !== undefined)}
          />,
          document.body
        )}

      {/* Info Sidebar moved to root for persistent mounting */}

      {/* Selection Action Bar */}
      <SelectionActionBar
        selectedCount={selectedItems.size}
        onClearSelection={clearSelection}
        onExitSelectionMode={exitSelectionMode}
        onRemoveFromCollection={
          allowRemoveFromCollection
            ? () => handleRemoveFromCollection(Array.from(selectedItems))
            : undefined
        }
        showRemoveFromCollection={allowRemoveFromCollection}
        actions={
          selectedItems.size > 0
            ? [
                {
                  label: 'Bulk Edit',
                  value: 'bulk-edit',
                  onSelect: () => {
                    setIsEditPanelOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setInfoSidebarOpen(false);
                      }
                      return next;
                    });
                  },
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
                  onSelect: () => handleRefreshThumbnails(Array.from(selectedItems)),
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
                  onSelect: () => handleRemoveStacks(Array.from(selectedItems)),
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

      {activeFolder && (
        <FolderDropDialog
          open={isFolderDialogOpen}
          folderName={activeFolder.name}
          fileCount={activeFolder.files.length}
          onCancel={handleFolderCancel}
          onConfirm={(mode, options) => handleFolderDecision(mode, options)}
        />
      )}

      {/* Portal for header actions - Info button */}
      {createPortal(
        <HeaderIconButton
          onClick={() => {
            // If opening info sidebar, turn off selection mode
            if (!infoSidebarOpen) {
              setSelectionMode(false);
            }
            setInfoSidebarOpen(!infoSidebarOpen);
          }}
          isActive={infoSidebarOpen}
          aria-label={infoSidebarOpen ? 'Close info panel' : 'Open info panel'}
        >
          <Info size={18} />
        </HeaderIconButton>,
        document.getElementById('header-actions') || document.body
      )}
    </DropZone>
  );
}
