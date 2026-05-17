import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { GalleryVerticalEnd, Info, NotebookText, PenTool, Pipette, Trash2 } from 'lucide-react';
import MersenneTwister from 'mersenne-twister';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FullPageDropZone } from '@/components/ui/DropZone';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import MarkerEditorDialog from '@/components/ui/SeekBar/MarkerEditorDialog';
import { useStackNavigation } from '@/hooks/features/useStackNavigation';
import { useStackViewer } from '@/hooks/features/useStackViewer';
import { useStackViewerInteractions } from '@/hooks/features/useStackViewerInteractions';
import { useStackViewerZoom } from '@/hooks/features/useStackViewerZoom';
import { useViewerContextMenu } from '@/hooks/features/useViewerContextMenu';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { useScratch } from '@/hooks/useScratch';
import { useViewContext } from '@/hooks/useViewContext';
import { apiClient } from '@/lib/api-client';
import { isVideoAsset } from '@/lib/media';
import { cn } from '@/lib/utils';
import {
  infoSidebarOpenAtom,
  selectedItemIdAtom,
  selectionModeAtom,
  sidebarOpenAtom,
} from '@/stores/ui';
import {
  addFilesToQueueAtom,
  addUploadNotificationAtom,
  uploadNotificationsAtom,
} from '@/stores/upload';
import type { Asset, VideoMarker as TVideoMarker, VideoMarker } from '@/types';
import AssetGrid from './AssetGrid';
import ColorPickerOverlay from './ColorPickerOverlay';
import ImageCarousel from './ImageCarousel';
import PenOverlay from './PenOverlay';
import StackPageIndicator from './StackPageIndicator';
import StackToolbar, { type AssetSortPreset } from './StackToolbar';
import TapZoneOverlay from './TapZoneOverlay';

interface StackViewerProps {
  datasetId: string;
  mediaType: string;
  stackId: string;
  listToken?: string;
}

interface ViewerShellProps {
  children: React.ReactNode;
  isReorderMode: boolean;
  isPenMode: boolean;
  isNativeInteractionMode: boolean;
  onDrop: (files: File[]) => void;
  onUrlDrop: (urls: string[]) => void;
}

const assetNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const getAssetSortName = (asset: Asset) => {
  if (asset.originalName && asset.originalName.trim().length > 0) {
    return asset.originalName;
  }
  const rawPath = asset.file || asset.url || '';
  const normalizedPath = rawPath.split('?')[0];
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || '';
};

const getAssetCreatedAtValue = (asset: Asset) => {
  const time = asset.createdAt ? new Date(asset.createdAt).getTime() : Number.NaN;
  if (Number.isFinite(time)) return time;
  const numericId = typeof asset.id === 'string' ? Number.parseInt(asset.id, 10) : asset.id;
  return Number.isFinite(numericId) ? numericId : 0;
};

const sortAssetsByPreset = (assets: Asset[], preset: AssetSortPreset) => {
  const sorted = [...assets];
  sorted.sort((left, right) => {
    switch (preset) {
      case 'filename-asc': {
        const byName = assetNameCollator.compare(getAssetSortName(left), getAssetSortName(right));
        if (byName !== 0) return byName;
        return getAssetCreatedAtValue(left) - getAssetCreatedAtValue(right);
      }
      case 'filename-desc': {
        const byName = assetNameCollator.compare(getAssetSortName(right), getAssetSortName(left));
        if (byName !== 0) return byName;
        return getAssetCreatedAtValue(right) - getAssetCreatedAtValue(left);
      }
      case 'created-asc': {
        const byCreated = getAssetCreatedAtValue(left) - getAssetCreatedAtValue(right);
        if (byCreated !== 0) return byCreated;
        return assetNameCollator.compare(getAssetSortName(left), getAssetSortName(right));
      }
      case 'created-desc': {
        const byCreated = getAssetCreatedAtValue(right) - getAssetCreatedAtValue(left);
        if (byCreated !== 0) return byCreated;
        return assetNameCollator.compare(getAssetSortName(left), getAssetSortName(right));
      }
      default:
        return 0;
    }
  });

  return sorted.map((asset, index) => ({ ...asset, orderInStack: index }));
};

function ViewerShell({
  children,
  isReorderMode,
  isPenMode,
  isNativeInteractionMode,
  onDrop,
  onUrlDrop,
}: ViewerShellProps) {
  // 並び替え中は誤ドロップを避けるため、ドロップゾーンを外す。
  if (isReorderMode) return <>{children}</>;

  return (
    <FullPageDropZone
      onDrop={onDrop}
      onUrlDrop={onUrlDrop}
      accept="image/*,video/*,application/pdf"
      multiple
      disabled={isPenMode || isNativeInteractionMode}
    >
      {children}
    </FullPageDropZone>
  );
}

export default function StackViewer({
  datasetId,
  mediaType,
  stackId,
  listToken,
}: StackViewerProps) {
  const [isInfoSidebarOpen, setIsInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const [, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const [sidebarOpen] = useAtom(sidebarOpenAtom);
  const setSelectionMode = useSetAtom(selectionModeAtom);
  const addFilesToQueue = useSetAtom(addFilesToQueueAtom);
  const uploadNotifications = useAtomValue(uploadNotificationsAtom);
  const addNotification = useSetAtom(addUploadNotificationAtom);
  const { ensureScratch } = useScratch(datasetId);
  const queryClient = useQueryClient();

  // Reorder mode state
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Asset[] | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  const {
    stack,
    isLoading,
    currentPage,
    setCurrentPage,
    isListMode,
    setIsListMode,
    handleFavoriteToggle,
    handleAssetFavoriteToggle,
    handleLikeToggle,
    refetch,
  } = useStackViewer({ datasetId, mediaType, stackId });

  // Interactions + neighbors + animations
  const {
    imageCarouselRef,
    dragOffset,
    currentAsset,
    nextAsset,
    prevAsset,
    onDrag,
    onDragEnd,
    onLeftTap,
    onRightTap,
  } = useStackViewerInteractions({
    datasetId,
    mediaType,
    stackId,
    listToken,
    stack,
    currentPage,
    setCurrentPage,
  });

  // Optimistic markers per assetId so UI updates immediately
  const [optimisticMarkers, setOptimisticMarkers] = useState<
    Record<string | number, VideoMarker[]>
  >({});
  const getMarkersFor = useCallback(
    (asset?: Asset) => {
      if (!asset) return [] as VideoMarker[];
      return optimisticMarkers[asset.id] ?? (asset.meta?.markers || []);
    },
    [optimisticMarkers]
  );
  const isCurrentVideoAsset = isVideoAsset(currentAsset);

  const handleSortPresetSelect = useCallback(
    (preset: AssetSortPreset) => {
      if (!stack || stack.assets.length < 2) return;

      setIsReorderMode(true);
      setPendingOrder((prev) => {
        const source = prev && prev.length > 0 ? prev : stack.assets.map((asset) => ({ ...asset }));
        return sortAssetsByPreset(source, preset);
      });
    },
    [stack]
  );

  // Navigation
  const { navigateBack } = useStackNavigation({ currentStackId: stackId, currentPage });
  const { ctx, update } = useViewContext();
  const navigate = useNavigate();
  // vertical drag state (local to component)
  const currentVerticalOffsetRef = useRef(0);
  const verticalAnimRef = useRef<number | null>(null);
  const lockedScrollYRef = useRef(0);
  const {
    isOpen: isViewerContextMenuOpen,
    position: viewerContextMenuPosition,
    menuRef: viewerContextMenuRef,
    close: closeViewerContextMenu,
    cancelPendingOpen: cancelPendingViewerContextMenu,
    triggerProps: viewerContextMenuTriggerProps,
  } = useViewerContextMenu();
  // ピッカー状態: 手動トグルとAltホールドのOR
  const [isColorPickerManual, setIsColorPickerManual] = useState(false);
  const [isColorPickerAlt, setIsColorPickerAlt] = useState(false);
  const isColorPicker = isColorPickerManual || isColorPickerAlt;
  // ペンモード
  const [isPenMode, setIsPenMode] = useState(false);
  const [isMetaNativeMode, setIsMetaNativeMode] = useState(false);
  const canUseImageTools = !!currentAsset && !isCurrentVideoAsset && !isListMode;
  const canUseNativeInteraction = canUseImageTools && !isColorPicker && !isPenMode;
  const isNativeInteractionMode = canUseNativeInteraction && isMetaNativeMode;
  const markerDialogPlaybackRef = useRef<{ time: number; wasPlaying: boolean } | null>(null);
  const canUseImageZoom = canUseImageTools && !isColorPicker && !isPenMode;
  const getZoomImageElement = useCallback(
    () => imageCarouselRef.current?.getCurrentImageElement() || null,
    [imageCarouselRef]
  );
  const getZoomSurfaceElement = useCallback(
    () => imageCarouselRef.current?.getCurrentImageSurfaceElement() || null,
    [imageCarouselRef]
  );
  const {
    zoomTransform,
    isZoomed,
    resetZoom,
    zoomWithWheel,
    startPinch,
    updatePinch,
    endPinch,
    panBy,
  } = useStackViewerZoom({
    enabled: canUseImageZoom,
    assetKey: currentAsset?.id ?? null,
    getImageElement: getZoomImageElement,
    getSurfaceElement: getZoomSurfaceElement,
    maxScale: 10,
  });
  const handlePenModeToggle = useCallback(() => {
    if (!canUseImageTools) return;
    setIsPenMode((prev) => {
      const next = !prev;
      if (next) {
        setIsColorPickerAlt(false);
        setIsColorPickerManual(false);
        resetZoom();
      }
      return next;
    });
  }, [canUseImageTools, resetZoom]);
  const handleColorPickerToggle = useCallback(() => {
    if (!canUseImageTools) return;
    setIsPenMode(false);
    resetZoom();
    setIsColorPickerManual((prev) => !prev);
  }, [canUseImageTools, resetZoom]);
  const handleInfoSidebarToggle = useCallback(() => {
    if (!isInfoSidebarOpen) setSelectionMode(false);
    setIsInfoSidebarOpen(!isInfoSidebarOpen);
  }, [isInfoSidebarOpen, setIsInfoSidebarOpen, setSelectionMode]);
  const handleContextMenuCancelRequest = useCallback(() => {
    cancelPendingViewerContextMenu();
    closeViewerContextMenu();
  }, [cancelPendingViewerContextMenu, closeViewerContextMenu]);

  useEffect(() => {
    if (canUseImageTools) return;
    setIsPenMode(false);
    setIsColorPickerAlt(false);
    setIsColorPickerManual(false);
  }, [canUseImageTools]);

  useEffect(() => {
    if (canUseNativeInteraction) return;
    setIsMetaNativeMode(false);
  }, [canUseNativeInteraction]);

  // Shuffle navigation (uses original list context if available)
  const mtRef = useRef<MersenneTwister | null>(null);
  if (!mtRef.current) mtRef.current = new MersenneTwister();

  const handleShuffle = useCallback(async () => {
    try {
      const baseDatasetId = ctx?.datasetId ?? datasetId;
      const baseMediaType = ctx?.mediaType ?? (mediaType as any);
      const baseFilter = ctx?.filters;
      const baseSort = ctx?.sort;

      const countResp = await apiClient.getStacks({
        datasetId: baseDatasetId,
        filter: baseFilter as any,
        sort: baseSort as any,
        limit: 1,
        offset: 0,
      });
      const totalCount = countResp.total ?? 0;
      if (totalCount <= 0) return;

      const PAGE_SIZE = 50;
      const rng = mtRef.current!;
      const MAX = 0x100000000;
      const bound = MAX - (MAX % totalCount);
      let r: number = 0;
      do {
        r = rng.random_int();
      } while (r >= bound);
      const targetIndex = r % totalCount;
      const pageIndex = Math.floor(targetIndex / PAGE_SIZE);
      const withinPageIndex = targetIndex % PAGE_SIZE;
      const page = await apiClient.getStacks({
        datasetId: baseDatasetId,
        filter: baseFilter as any,
        sort: baseSort as any,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      });
      const item = page.stacks?.[withinPageIndex];
      if (!item) return;

      // Build a local window for cross-stack neighbors from the fetched page
      const pageIds = (page.stacks || [])
        .map((s: any) => (typeof s.id === 'string' ? Number.parseInt(s.id, 10) : (s.id as number)))
        .reverse();
      const targetId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
      const token = listToken || (ctx?.token ?? '');
      if (token && pageIds.length > 0) {
        update((prev) => {
          const base =
            prev && prev.token === token
              ? prev
              : ({
                  token,
                  datasetId: String(baseDatasetId),
                  mediaType: baseMediaType,
                  filters: baseFilter,
                  sort: baseSort,
                  ids: [],
                  currentIndex: 0,
                  createdAt: Date.now(),
                } as any);

          const next = { ...base } as any;
          next.ids = pageIds;
          next.currentIndex = Math.max(
            0,
            pageIds.findIndex((id: number) => id === targetId)
          );
          next.createdAt = Date.now();
          return next;
        });
      }

      void navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId: String(baseDatasetId), stackId: String(item.id) },
        search: { page: 0, mediaType: String(baseMediaType), listToken: token || undefined },
        replace: true,
      });
      // Ensure single-image mode for gestures
      setIsListMode(false);
    } catch (e) {
      console.error('Shuffle in viewer failed:', e);
    }
  }, [ctx, datasetId, mediaType, listToken, update, navigate, setIsListMode]);

  const handleSeparateAsset = useCallback(
    async (assetId: string | number) => {
      try {
        await apiClient.separateAsset(assetId);
        await refetch();
        await queryClient.invalidateQueries({ queryKey: ['stacks'] });
        await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      } catch (error) {
        console.error('Failed to separate asset:', error);
      }
    },
    [datasetId, queryClient, refetch]
  );

  const handleDeleteCurrentStack = useCallback(async () => {
    if (!stack) return;
    const stackIdValue =
      typeof stack.id === 'string' ? Number.parseInt(stack.id, 10) : (stack.id as number);
    const name = stack.name || 'this stack';
    const confirmed = window.confirm(
      `Are you sure you want to delete the stack "${name}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await apiClient.removeStack(stackIdValue);
      setIsInfoSidebarOpen(false);
      setSelectedItemId(null);
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });

      const currentPath = window.location.pathname;
      if (currentPath.includes('/stacks/')) {
        const targetMediaType = (stack.mediaType as string) || mediaType || 'image';
        await navigate({
          to: '/library/$datasetId/media-type/$mediaType',
          params: { datasetId, mediaType: String(targetMediaType) },
        });
      } else {
        navigateBack();
      }
    } catch (error) {
      console.error('Failed to delete stack:', error);
      alert('Failed to delete stack. Please try again.');
    }
  }, [
    datasetId,
    mediaType,
    navigate,
    navigateBack,
    queryClient,
    setIsInfoSidebarOpen,
    setSelectedItemId,
    stack,
  ]);
  const handleContextMenuInfo = useCallback(() => {
    if (!stack) return;
    closeViewerContextMenu();
    setSelectedItemId(stack.id);
    setIsInfoSidebarOpen(true);
  }, [closeViewerContextMenu, setIsInfoSidebarOpen, setSelectedItemId, stack]);
  const handleContextMenuFindSimilar = useCallback(async () => {
    if (!stack) return;
    closeViewerContextMenu();
    const id = typeof stack.id === 'string' ? Number.parseInt(stack.id, 10) : (stack.id as number);
    await navigate({
      to: '/library/$datasetId/stacks/$stackId/similar',
      params: { datasetId, stackId: String(id) },
    });
  }, [closeViewerContextMenu, datasetId, navigate, stack]);
  const handleContextMenuAddToScratch = useCallback(async () => {
    if (!stack) return;
    closeViewerContextMenu();

    try {
      const sc = await ensureScratch();
      const id =
        typeof stack.id === 'string' ? Number.parseInt(stack.id, 10) : (stack.id as number);
      await apiClient.addStackToCollection(sc.id, id);
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
      await queryClient.invalidateQueries({
        queryKey: ['library-counts', datasetId],
      });
      await queryClient.refetchQueries({ queryKey: ['library-counts', datasetId] });
    } catch (e) {
      console.error('Failed to add to Scratch', e);
    }
  }, [closeViewerContextMenu, datasetId, ensureScratch, queryClient, stack]);
  const handleContextMenuDelete = useCallback(() => {
    closeViewerContextMenu();
    void handleDeleteCurrentStack();
  }, [closeViewerContextMenu, handleDeleteCurrentStack]);

  // --- Marker editor state ---
  const [markerEditor, setMarkerEditor] = useState<{
    open: boolean;
    index: number;
    time: number;
    color: string;
  } | null>(null);
  const openMarkerEditor = useCallback(
    (marker: TVideoMarker, index: number) => {
      // Capture current playback at moment of open (after any seek move)
      const refAny = imageCarouselRef.current as any;
      if (refAny?.isCurrentVideo?.()) {
        markerDialogPlaybackRef.current = {
          time: Number(refAny?.getCurrentTime?.() ?? 0) || 0,
          wasPlaying: !!refAny?.getIsPlaying?.(),
        };
        // Ensure the player keeps its state (robust to reflows)
        refAny?.requestRestorePlayback?.(markerDialogPlaybackRef.current);
      } else {
        markerDialogPlaybackRef.current = null;
      }
      setMarkerEditor({
        open: true,
        index,
        time: marker.time,
        color: marker.color || 'bright-blue',
      });
    },
    [imageCarouselRef.current]
  );
  const closeMarkerEditor = useCallback(
    () => setMarkerEditor((p) => (p ? { ...p, open: false } : p)),
    []
  );

  // Always enable gesture mode when stack changes
  useEffect(() => {
    setIsListMode(false);
  }, [setIsListMode]);

  // Keep InfoSidebar open state across cross-stack navigation and update its target
  useEffect(() => {
    if (isInfoSidebarOpen && stack) {
      setSelectedItemId(stack.id);
    }
  }, [isInfoSidebarOpen, stack?.id, setSelectedItemId, stack]);

  // Expose shuffle button in header
  useHeaderActions({
    showShuffle: true,
    showFilter: false,
    showSelection: false,
    onShuffle: handleShuffle,
  });

  // Body scroll lock while viewer is active to prevent iOS pull-to-refresh and page scroll
  useEffect(() => {
    const body = document.body as HTMLBodyElement;
    // Preserve current scroll position
    lockedScrollYRef.current = window.scrollY || window.pageYOffset || 0;
    // Apply lock styles
    const prevStyle = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      touchAction: (body.style as any).touchAction,
      overscrollBehaviorY: (body.style as any).overscrollBehaviorY,
    } as const;
    body.style.position = 'fixed';
    body.style.top = `-${lockedScrollYRef.current}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    (body.style as any).overscrollBehaviorY = 'contain';

    return () => {
      // Restore styles; scroll復元は一覧側で安全に実行（DOM構築後）
      body.style.position = prevStyle.position;
      body.style.top = prevStyle.top;
      body.style.width = prevStyle.width;
      body.style.overflow = prevStyle.overflow;
      (body.style as any).touchAction = prevStyle.touchAction || '';
      (body.style as any).overscrollBehaviorY = prevStyle.overscrollBehaviorY || '';
    };
  }, []);

  // Keyboard: Left=next, Right=previous, ESC=Back/CancelPicker, z=toggle list, e=toggle info, s=shuffle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      )
        return;
      // When any dialog is open, ignore global shortcuts (let dialog handle Esc/Enter)
      const dialogOpen = !!document.querySelector(
        '[role="dialog"][data-state="open"], [data-radix-dialog-content]'
      );
      if (dialogOpen) return;
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey || e.shiftKey;
      const refAny = imageCarouselRef.current as any;
      const isCurrentVideo = !!refAny?.isCurrentVideo?.();
      if (e.key === 'Meta') {
        setIsMetaNativeMode(true);
      }
      if (isColorPicker && e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setIsColorPickerAlt(false);
        setIsColorPickerManual(false);
        return;
      }
      // --- Video shortcuts (video mode only) ---
      const isVideo = isCurrentVideo;
      if (isVideo) {
        // Space: toggle play/pause
        if (e.key === ' ') {
          e.preventDefault();
          refAny?.toggleVideo?.();
          return;
        }
        // Frame step: '.' next, ',' prev (then pause)
        if (e.key === '.') {
          e.preventDefault();
          refAny?.stepFrame?.(1);
          return;
        }
        if (e.key === ',') {
          e.preventDefault();
          refAny?.stepFrame?.(-1);
          return;
        }
        const lower = e.key.toLowerCase();
        // J/K: -1s / +1s (preserve playing state)
        if (lower === 'j') {
          refAny?.seekBySeconds?.(-1, true);
          return;
        }
        if (lower === 'k') {
          refAny?.seekBySeconds?.(1, true);
          return;
        }
        // h/l: to start / to last frame (preserve playing state)
        if (lower === 'h') {
          refAny?.seekToStart?.(true);
          return;
        }
        if (lower === 'l') {
          refAny?.seekToEnd?.(true);
          return;
        }
        // m: add/edit marker at current time
        if (lower === 'm') {
          e.preventDefault();
          const t = Number(refAny?.getCurrentTime?.() ?? 0) || 0;
          const asset = currentAsset;
          if (!asset) return;
          // Preserve current playback state across updates
          const pb = { time: t, wasPlaying: !!refAny?.getIsPlaying?.() };
          const arr = getMarkersFor(asset);
          // 近接判定: ±0.15s 以内を「同一点」とみなして編集モードへ
          const threshold = 0.15;
          const hitIndex = arr.findIndex((m) => Math.abs(m.time - t) <= threshold);
          if (hitIndex >= 0) {
            openMarkerEditor(arr[hitIndex], hitIndex);
            // Keep playback state when editor opens
            (imageCarouselRef.current as any)?.requestRestorePlayback?.(pb);
            return;
          }
          // 近接無し → 追加して即保存（従来どおり）
          const existing = arr.slice();
          const newMarker: VideoMarker = { time: t, color: 'hard-pink', label: '' };
          const nextMarkers = [...existing, newMarker].sort((a, b) => a.time - b.time);
          setOptimisticMarkers((prev) => ({ ...prev, [asset.id]: nextMarkers }));
          // Immediate restore (guard against any incidental re-render)
          (imageCarouselRef.current as any)?.requestRestorePlayback?.(pb);
          apiClient
            .updateAssetMeta({
              datasetId,
              stackId,
              assetId: asset.id,
              meta: { ...(asset.meta || {}), markers: nextMarkers },
            })
            .then(async () => {
              await refetch();
              (imageCarouselRef.current as any)?.requestRestorePlayback?.(pb);
            })
            .catch((err) => console.error('Failed to update markers:', err));
          return;
        }
      }
      switch (e.key) {
        case 'ArrowLeft':
          if (stack && currentPage < stack.assets.length - 1) setCurrentPage((p) => p + 1);
          else if (mediaType !== 'comic') onLeftTap();
          break;
        case 'ArrowRight':
          if (currentPage > 0) setCurrentPage((p) => p - 1);
          else if (mediaType !== 'comic') onRightTap();
          break;
        case 'Escape':
          navigateBack();
          break;
        case 'z':
          setIsListMode((prev) => !prev);
          break;
        case 'e':
          setIsInfoSidebarOpen(!isInfoSidebarOpen);
          break;
        case 's':
          handleShuffle();
          break;
        case 'n':
          if (hasModifier || !canUseImageTools) break;
          setIsPenMode((v) => {
            const next = !v;
            if (next) {
              setIsColorPickerAlt(false);
              setIsColorPickerManual(false);
            }
            return next;
          });
          break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta') {
        setIsMetaNativeMode(false);
      }
    };
    const handleBlur = () => {
      setIsMetaNativeMode(false);
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!e.metaKey) {
        setIsMetaNativeMode(false);
      }
    };
    const handleDragEnd = (e: DragEvent) => {
      if (!e.metaKey) {
        setIsMetaNativeMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('dragend', handleDragEnd);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('dragend', handleDragEnd);
    };
  }, [
    currentPage,
    stack,
    navigateBack,
    isInfoSidebarOpen,
    setIsInfoSidebarOpen,
    setIsListMode,
    onLeftTap,
    onRightTap,
    mediaType,
    setCurrentPage,
    handleShuffle,
    isColorPicker,
    canUseImageTools,
    imageCarouselRef,
    currentAsset,
    datasetId,
    stackId,
    refetch,
    getMarkersFor,
    openMarkerEditor,
  ]);

  // pointerup はオーバーレイ側でコピー処理を実行するため、ここでは扱わない

  // Upload completion → refetch stack
  useEffect(() => {
    const done = uploadNotifications.some(
      (n) => n.type === 'success' && n.message.includes('アップロード')
    );
    if (done) refetch();
  }, [uploadNotifications, refetch]);

  // Drop to add assets
  const handleFileDrop = (files: File[]) => {
    if (!stack) return;
    addFilesToQueue({ files, type: 'add-to-stack', stackId: Number(stack.id) });
  };

  const handleUrlDrop = useCallback(
    async (urls: string[]) => {
      if (!stack || urls.length === 0) return;

      addNotification({
        type: 'info',
        message: `${urls.length}件のURLをダウンロード中です`,
      });

      try {
        const { results } = await apiClient.importAssetsFromUrls({
          stackId: Number(stack.id),
          urls,
        });

        const successes = results.filter(
          (result) => result.status === 'added' || result.status === 'created'
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
          await refetch();
          void queryClient.invalidateQueries({ queryKey: ['stacks'] });
          const datasetNumericId = Number(datasetId);
          if (!Number.isNaN(datasetNumericId)) {
            void queryClient.invalidateQueries({ queryKey: ['library-counts', datasetNumericId] });
          }
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
        console.error('Failed to import URLs for stack', error);
        addNotification({ type: 'error', message: 'URLのアップロードに失敗しました' });
      }
    },
    [stack, addNotification, refetch, queryClient, datasetId]
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stack) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-xl mb-2">Stack not found</p>
          <button
            onClick={navigateBack}
            className="px-4 py-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const gestureState = { translateX: 0, translateY: 0, scale: 1, opacity: 1 };
  const isGesturing = false;

  return (
    <ViewerShell
      isReorderMode={isReorderMode}
      isPenMode={isPenMode}
      isNativeInteractionMode={isNativeInteractionMode}
      onDrop={handleFileDrop}
      onUrlDrop={handleUrlDrop}
    >
      <div
        className="fixed top-0 left-0 right-0 bottom-0 bg-black"
        id="stack-viewer-container"
        style={{
          // Avoid overscroll chain while allowing pinch-zoom
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'auto',
        }}
      >
        <div className="fixed top-0 left-0 right-0 h-14 bg-white" />

        <div
          className={cn(
            'stack-content fixed top-14 bottom-0 transition-all duration-300 ease-in-out',
            sidebarOpen ? 'left-80' : 'left-0',
            isInfoSidebarOpen ? 'right-80' : 'right-0'
          )}
        >
          {!isListMode ? (
            <div
              className="relative w-full h-full"
              style={{
                WebkitTouchCallout: isNativeInteractionMode ? 'default' : 'none',
                userSelect: isNativeInteractionMode ? 'auto' : 'none',
              }}
              {...(isNativeInteractionMode ? {} : viewerContextMenuTriggerProps)}
            >
              <ImageCarousel
                ref={imageCarouselRef as any}
                currentAsset={currentAsset}
                nextAsset={nextAsset}
                prevAsset={prevAsset}
                markers={getMarkersFor(currentAsset)}
                onEditMarkerRequest={(marker, index) => openMarkerEditor(marker as any, index)}
                gestureTransform={gestureState}
                translateX={dragOffset}
                nativeDragEnabled={isNativeInteractionMode}
                zoomTransform={zoomTransform}
                uiInsets={{
                  top: 56,
                  left: sidebarOpen ? 320 : 0,
                  right: isInfoSidebarOpen ? 320 : 0,
                }}
                className="w-full h-full"
              />
              <TapZoneOverlay
                enabled={!isListMode && !isColorPicker && !isPenMode && !isNativeInteractionMode}
                // Leave safe area at bottom so toolbar remains clickable
                contentArea={{
                  top: 14,
                  left: sidebarOpen ? 320 : 0,
                  right: isInfoSidebarOpen ? 320 : 0,
                  bottom: 96,
                }}
                disableDrag={isZoomed || isColorPicker || isPenMode || isNativeInteractionMode}
                isZoomed={isZoomed}
                canGoLeft={stack ? currentPage < stack.assets.length - 1 : false}
                canGoRight={stack ? currentPage > 0 : false}
                onLeftTap={onLeftTap}
                onRightTap={onRightTap}
                onWheelZoom={
                  canUseImageZoom && !isViewerContextMenuOpen ? zoomWithWheel : undefined
                }
                onPinchStart={canUseImageZoom && !isViewerContextMenuOpen ? startPinch : undefined}
                onPinchZoom={canUseImageZoom && !isViewerContextMenuOpen ? updatePinch : undefined}
                onPinchEnd={canUseImageZoom && !isViewerContextMenuOpen ? endPinch : undefined}
                onZoomPan={canUseImageZoom && !isViewerContextMenuOpen ? panBy : undefined}
                onContextMenuCancelRequest={handleContextMenuCancelRequest}
                onCenterTap={() => {
                  // Move無しのクリック/タップ: 動画なら再生/停止をトグル
                  const ref = imageCarouselRef.current as any;
                  if (ref && typeof ref.isCurrentVideo === 'function' && ref.isCurrentVideo()) {
                    if (typeof ref.toggleVideo === 'function') ref.toggleVideo();
                  }
                }}
                onDrag={(dx) => {
                  if (isZoomed) return;
                  onDrag(dx);
                }}
                onDragEnd={(dx, velocity) => {
                  if (isZoomed) return;
                  onDragEnd(dx, velocity);
                }}
                onVerticalDrag={(deltaY, progress) => {
                  if (isZoomed) return;
                  if (!imageCarouselRef.current) return;
                  // Default vertical dismiss behavior
                  verticalAnimRef.current && cancelAnimationFrame(verticalAnimRef.current);
                  currentVerticalOffsetRef.current += deltaY;
                  const scale = Math.max(0, 1 - progress * 0.5);
                  const opacity = Math.max(0, 1 - progress * 0.7);
                  const bg = Math.max(0, Math.min(1, progress));
                  imageCarouselRef.current.updateVerticalTransform(
                    currentVerticalOffsetRef.current,
                    scale,
                    opacity,
                    bg
                  );
                }}
                onVerticalDragEnd={(_, velocity, progress) => {
                  if (isZoomed) return;
                  if (!imageCarouselRef.current) return;
                  verticalAnimRef.current && cancelAnimationFrame(verticalAnimRef.current);
                  const dismissThreshold = 0.8;
                  const velocityThreshold = 600;
                  if (progress > dismissThreshold || velocity > velocityThreshold) {
                    const containerEl = document.getElementById('stack-viewer-container');
                    if (containerEl) {
                      containerEl.style.backgroundColor = 'white';
                      containerEl.style.transition = 'none';
                    }
                    const isUpward = currentVerticalOffsetRef.current < 0;
                    const targetOffset = (isUpward ? -1 : 1) * window.innerHeight * 1.2;
                    const step = () => {
                      const cur = currentVerticalOffsetRef.current;
                      const nx = cur + (targetOffset - cur) * 0.15;
                      currentVerticalOffsetRef.current = nx;
                      const animProgress = Math.abs(nx) / window.innerHeight;
                      const scale = Math.max(0, 1 - animProgress * 0.5);
                      const opacity = Math.max(0, 1 - animProgress);
                      const bg = Math.min(1, animProgress);
                      imageCarouselRef.current!.updateVerticalTransform(nx, scale, opacity, bg);
                      if (bg >= 1) {
                        verticalAnimRef.current = null;
                        if (isUpward) {
                          navigate({
                            to: '/library/$datasetId/stacks/$stackId/similar',
                            params: { datasetId, stackId },
                          });
                        } else {
                          navigateBack();
                        }
                        return;
                      }
                      verticalAnimRef.current = requestAnimationFrame(step);
                    };
                    verticalAnimRef.current = requestAnimationFrame(step);
                  } else {
                    // Return to center
                    const step = () => {
                      const cur = currentVerticalOffsetRef.current;
                      const nx = cur + (0 - cur) * 0.15;
                      if (Math.abs(nx) < 0.5) {
                        currentVerticalOffsetRef.current = 0;
                        imageCarouselRef.current!.updateVerticalTransform(0, 1, 1, 0);
                        verticalAnimRef.current = null;
                        return;
                      }
                      currentVerticalOffsetRef.current = nx;
                      const prog = Math.abs(nx) / window.innerHeight;
                      const scale = Math.max(0, 1 - prog * 0.5);
                      const opacity = Math.max(0, 1 - prog * 0.7);
                      imageCarouselRef.current!.updateVerticalTransform(
                        nx,
                        scale,
                        opacity,
                        Math.max(0, Math.min(1, prog))
                      );
                      verticalAnimRef.current = requestAnimationFrame(step);
                    };
                    verticalAnimRef.current = requestAnimationFrame(step);
                  }
                }}
              />
            </div>
          ) : (
            <AssetGrid
              assets={isReorderMode && pendingOrder ? pendingOrder : stack.assets}
              currentPage={currentPage}
              onSelectPage={(page) => {
                setCurrentPage(page);
                setIsListMode(false);
              }}
              // Reorder mode decoupled from Info panel; we allow reordering only in explicit mode
              isEditMode={isReorderMode}
              onSortPresetSelect={handleSortPresetSelect}
              canSortAssets={stack.assets.length >= 2}
              onReorderToggle={() => {
                setIsReorderMode((prev) => {
                  const next = !prev;
                  if (next) {
                    setPendingOrder(stack.assets.map((a) => ({ ...a })) as any);
                  } else {
                    setPendingOrder(null);
                  }
                  return next;
                });
              }}
              onSeparateAsset={!isReorderMode ? handleSeparateAsset : undefined}
              // Disable removal while reordering for clarity
              onRemoveAsset={
                !isReorderMode
                  ? async (assetId) => {
                      try {
                        await apiClient.removeAsset(assetId);
                        await refetch();
                      } catch (error) {
                        console.error('Failed to remove asset:', error);
                      }
                    }
                  : undefined
              }
              // Collect pending order locally; persist on confirmation
              onReorderAssets={
                isReorderMode
                  ? (reorderedAssets) => {
                      setPendingOrder(reorderedAssets);
                    }
                  : undefined
              }
              reorderBanner={
                isReorderMode
                  ? {
                      show: true,
                      canSave:
                        !!pendingOrder &&
                        pendingOrder.length === stack.assets.length &&
                        pendingOrder.some((a, i) => a.id !== stack.assets[i].id),
                      saving: isSavingOrder,
                      onSave: async () => {
                        if (!pendingOrder) return;
                        try {
                          setIsSavingOrder(true);
                          for (const asset of pendingOrder) {
                            await apiClient.updateAssetOrder(asset.id, asset.orderInStack || 0);
                          }
                          await refetch();
                          setIsReorderMode(false);
                          setPendingOrder(null);
                        } catch (e) {
                          console.error('Failed to save asset order:', e);
                        } finally {
                          setIsSavingOrder(false);
                        }
                      },
                      onCancel: () => {
                        setIsReorderMode(false);
                        setPendingOrder(null);
                      },
                    }
                  : undefined
              }
              className="pt-14"
            />
          )}

          {isViewerContextMenuOpen && !isListMode && (
            <div
              ref={viewerContextMenuRef}
              className="fixed z-50 w-48 overflow-hidden rounded-md border border-gray-200 bg-white p-1 text-gray-700 shadow-md"
              style={{
                left: viewerContextMenuPosition.x,
                top: viewerContextMenuPosition.y,
              }}
              role="menu"
            >
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-gray-100 hover:text-gray-700"
                onClick={handleContextMenuInfo}
                role="menuitem"
              >
                <Info className="w-4 h-4 mr-2" />
                Info
              </button>
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-gray-100 hover:text-gray-700"
                onClick={() => void handleContextMenuFindSimilar()}
                role="menuitem"
              >
                <GalleryVerticalEnd className="w-4 h-4 mr-2" />
                Find similar
              </button>
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-gray-100 hover:text-gray-700"
                onClick={() => void handleContextMenuAddToScratch()}
                role="menuitem"
              >
                <NotebookText className="w-4 h-4 mr-2" />
                Add to Scratch
              </button>
              <div className="-mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] text-red-600 outline-none transition-colors hover:bg-gray-100 hover:text-red-600"
                onClick={handleContextMenuDelete}
                role="menuitem"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </button>
            </div>
          )}

          <StackPageIndicator
            currentPage={currentPage}
            totalPages={stack.assets.length}
            isGesturing={isGesturing}
          />

          <StackToolbar
            stack={stack}
            isListMode={isListMode}
            isGesturing={isGesturing}
            isCurrentAssetFavorited={Boolean(currentAsset?.favorited ?? currentAsset?.isFavorite)}
            onStackFavoriteToggle={handleFavoriteToggle}
            onAssetFavoriteToggle={handleAssetFavoriteToggle}
            onLikeToggle={handleLikeToggle}
            onListModeToggle={() => setIsListMode((prev) => !prev)}
          />
        </div>
      </div>

      {/* Pen overlay (draws above content, below header) */}
      {isPenMode && (
        <PenOverlay
          leftInset={sidebarOpen ? 320 : 0}
          rightInset={isInfoSidebarOpen ? 320 : 0}
          topInset={56}
          docKey={`${datasetId}:${stackId}:${currentAsset?.id ?? 'na'}`}
          getImageEl={() => imageCarouselRef.current?.getCurrentImageElement() || null}
          onExit={() => setIsPenMode(false)}
        />
      )}

      {/* Info Sidebar is rendered globally in root for smooth transitions */}

      {createPortal(
        <HeaderIconButton
          onClick={handlePenModeToggle}
          isActive={isPenMode}
          disabled={!canUseImageTools}
          aria-label={isPenMode ? 'Exit pen mode' : 'Enter pen mode'}
        >
          <PenTool size={18} />
        </HeaderIconButton>,
        document.getElementById('header-actions') || document.body
      )}

      {createPortal(
        <HeaderIconButton
          onClick={handleColorPickerToggle}
          isActive={isColorPicker}
          disabled={!canUseImageTools}
          aria-label={isColorPicker ? 'Exit color picker' : 'Enter color picker'}
        >
          <Pipette size={18} />
        </HeaderIconButton>,
        document.getElementById('header-actions') || document.body
      )}

      {createPortal(
        <HeaderIconButton
          onClick={handleInfoSidebarToggle}
          isActive={isInfoSidebarOpen}
          aria-label={isInfoSidebarOpen ? 'Close info panel' : 'Open info panel'}
        >
          <Info size={18} />
        </HeaderIconButton>,
        document.getElementById('header-actions') || document.body
      )}

      {isColorPicker && (
        <ColorPickerOverlay
          getImageEl={() => imageCarouselRef.current?.getCurrentImageElement() || null}
          onCancel={() => {
            setIsColorPickerAlt(false);
            setIsColorPickerManual(false);
          }}
          altMode={isColorPickerAlt && !isColorPickerManual}
          onCopied={(hex) => {
            addNotification({ type: 'success', message: `Copied ${hex} to clipboard` });
          }}
        />
      )}

      {/* Marker Editor Dialog */}
      {markerEditor && (
        <MarkerEditorDialog
          open={markerEditor.open}
          time={markerEditor.time}
          color={markerEditor.color}
          onOpenChange={(o) => {
            if (!o) closeMarkerEditor();
            // When dialog visibility changes, re-apply saved playback (if any)
            if (!o && markerDialogPlaybackRef.current) {
              (imageCarouselRef.current as any)?.requestRestorePlayback?.(
                markerDialogPlaybackRef.current
              );
            }
          }}
          onDelete={async () => {
            const asset = currentAsset;
            if (!asset) return;
            const arr = getMarkersFor(asset).slice();
            if (markerEditor.index < 0 || markerEditor.index >= arr.length) return;
            arr.splice(markerEditor.index, 1);
            setOptimisticMarkers((prev) => ({ ...prev, [asset.id]: arr }));
            try {
              await apiClient.updateAssetMeta({
                datasetId,
                stackId,
                assetId: asset.id,
                meta: { ...(asset.meta || {}), markers: arr },
              });
              await refetch();
            } catch (err) {
              console.error('Failed to delete marker:', err);
            } finally {
              closeMarkerEditor();
              if (markerDialogPlaybackRef.current) {
                (imageCarouselRef.current as any)?.requestRestorePlayback?.(
                  markerDialogPlaybackRef.current
                );
              }
            }
          }}
          onSave={async ({ time, color }) => {
            const asset = currentAsset;
            if (!asset) return;
            const arr = getMarkersFor(asset).slice();
            const i = markerEditor.index;
            if (i < 0 || i >= arr.length) return;
            const updated: TVideoMarker = { ...(arr[i] as any), time, color };
            const next = arr
              .map((m, idx) => (idx === i ? updated : m))
              .sort((a, b) => a.time - b.time);
            setOptimisticMarkers((prev) => ({ ...prev, [asset.id]: next }));
            try {
              await apiClient.updateAssetMeta({
                datasetId,
                stackId,
                assetId: asset.id,
                meta: { ...(asset.meta || {}), markers: next },
              });
              await refetch();
            } catch (err) {
              console.error('Failed to save marker:', err);
            } finally {
              closeMarkerEditor();
              if (markerDialogPlaybackRef.current) {
                (imageCarouselRef.current as any)?.requestRestorePlayback?.(
                  markerDialogPlaybackRef.current
                );
              }
            }
          }}
        />
      )}
    </ViewerShell>
  );
}
