import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Download,
  GalleryVerticalEnd,
  Info,
  NotebookText,
  PenTool,
  Pipette,
  Trash2,
  X,
} from 'lucide-react';
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
import { downloadAssetOriginals, downloadStackOriginals } from '@/lib/download-originals';
import { useT } from '@/lib/i18n';
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
  returnTo?: string;
  /** ルーティングなしで埋め込み表示する(チュートリアル等)。レイアウトのサイドバー連動や類似ページ遷移を無効化する */
  embedded?: boolean;
  /** 埋め込み時の閉じる要求(ドラッグ閉じ・Esc など)。指定時はルーター遷移の代わりに呼ばれる */
  onRequestClose?: () => void;
  /** 埋め込み時のヘッダーテーマカラー(本物のヘッダーと同じ配色にする) */
  embeddedThemeColor?: string;
  /** 埋め込み時に隣接スタックへスワイプ移動したときの通知(ルート遷移の代わり) */
  onNavigateStack?: (stackId: string) => void;
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
  returnTo,
  embedded = false,
  onRequestClose,
  embeddedThemeColor,
  onNavigateStack,
}: StackViewerProps) {
  const t = useT();
  const [isInfoSidebarOpen, setIsInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const [, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const [rawSidebarOpen] = useAtom(sidebarOpenAtom);
  // 埋め込み時はアプリのサイドバーが存在しないため、レイアウト連動を無効化する
  const sidebarOpen = embedded ? false : rawSidebarOpen;
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
    returnTo,
    stack,
    currentPage,
    setCurrentPage,
    onNavigateStack: embedded ? onNavigateStack : undefined,
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
  const { navigateBack: routerNavigateBack } = useStackNavigation({
    currentStackId: stackId,
    currentPage,
    returnTo,
  });
  // 埋め込み時はルーター遷移ではなく onRequestClose で閉じる
  const navigateBack = useCallback(() => {
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    routerNavigateBack();
  }, [onRequestClose, routerNavigateBack]);
  const { ctx, update } = useViewContext();
  const navigate = useNavigate();
  const shuffleInFlightRef = useRef(false);
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
  const canUseZoom = !!currentAsset && !isListMode;
  const canUseZoomInteraction = canUseZoom && !isColorPicker && !isPenMode;
  const getZoomMediaElement = useCallback(
    () => imageCarouselRef.current?.getCurrentZoomMediaElement() || null,
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
    enabled: canUseZoom,
    assetKey: currentAsset?.id ?? null,
    getMediaElement: getZoomMediaElement,
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
      }
      return next;
    });
  }, [canUseImageTools]);
  const handleColorPickerToggle = useCallback(() => {
    if (!canUseImageTools) return;
    setIsPenMode(false);
    setIsColorPickerManual((prev) => !prev);
  }, [canUseImageTools]);
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
  const shuffleStateRef = useRef<{
    ctx: typeof ctx;
    datasetId: string;
    mediaType: string;
    listToken?: string;
    returnTo?: string;
    update: typeof update;
    navigate: typeof navigate;
    setIsListMode: typeof setIsListMode;
  } | null>(null);
  shuffleStateRef.current = {
    ctx,
    datasetId,
    mediaType,
    listToken,
    returnTo,
    update,
    navigate,
    setIsListMode,
  };

  const handleShuffle = useCallback(async () => {
    if (shuffleInFlightRef.current) return;
    shuffleInFlightRef.current = true;

    try {
      const state = shuffleStateRef.current;
      if (!state) return;

      const baseDatasetId = state.ctx?.datasetId ?? state.datasetId;
      const baseMediaType = state.ctx?.mediaType ?? (state.mediaType as any);
      const baseFilter = state.ctx?.filters;
      const baseSort = state.ctx?.sort;

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
      const token = state.listToken || (state.ctx?.token ?? '');
      if (token && pageIds.length > 0) {
        state.update((prev) => {
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

      void state.navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId: String(baseDatasetId), stackId: String(item.id) },
        search: {
          page: 0,
          mediaType: String(baseMediaType),
          listToken: token || undefined,
          returnTo: state.returnTo,
        },
        replace: true,
      });
      // Ensure single-image mode for gestures
      state.setIsListMode(false);
    } catch (e) {
      console.error('Shuffle in viewer failed:', e);
    } finally {
      shuffleInFlightRef.current = false;
    }
  }, []);

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
    const name = stack.name || t.common.untitled;
    const confirmed = window.confirm(t.viewer.deleteStackConfirm(name));
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
      alert(t.viewer.deleteStackFailed);
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
    t,
  ]);
  const handleContextMenuInfo = useCallback(() => {
    if (!stack) return;
    closeViewerContextMenu();
    setSelectedItemId(stack.id);
    setIsInfoSidebarOpen(true);
  }, [closeViewerContextMenu, setIsInfoSidebarOpen, setSelectedItemId, stack]);
  const handleContextMenuDownloadCurrent = useCallback(() => {
    if (!currentAsset) return;
    closeViewerContextMenu();
    downloadAssetOriginals(datasetId, [currentAsset.id]);
  }, [closeViewerContextMenu, currentAsset, datasetId]);
  const handleContextMenuDownloadAll = useCallback(() => {
    if (!stack) return;
    closeViewerContextMenu();
    downloadStackOriginals(datasetId, [stack.id]);
  }, [closeViewerContextMenu, datasetId, stack]);
  const handleDownloadCurrentVideoFrame = useCallback(async () => {
    const success = await imageCarouselRef.current?.downloadCurrentVideoFrame();
    if (!success) {
      addNotification({
        type: 'error',
        message: t.viewer.downloadFrameFailed,
      });
    }
  }, [addNotification, imageCarouselRef, t]);
  const handleContextMenuDownloadCurrentFrame = useCallback(() => {
    closeViewerContextMenu();
    void handleDownloadCurrentVideoFrame();
  }, [closeViewerContextMenu, handleDownloadCurrentVideoFrame]);
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
      const carousel = imageCarouselRef.current;
      if (carousel?.isCurrentVideo()) {
        markerDialogPlaybackRef.current = {
          time: Number(carousel.getCurrentTime() ?? 0) || 0,
          wasPlaying: carousel.getIsPlaying(),
        };
        // Ensure the player keeps its state (robust to reflows)
        carousel.requestRestorePlayback(markerDialogPlaybackRef.current);
      } else {
        markerDialogPlaybackRef.current = null;
      }
      setMarkerEditor({
        open: true,
        index,
        time: marker.time,
        color: marker.color || 'white',
      });
    },
    [imageCarouselRef.current]
  );
  const getCurrentVideoPlayback = useCallback(() => {
    const carousel = imageCarouselRef.current;
    if (!carousel?.isCurrentVideo()) return null;
    return {
      time: Number(carousel.getCurrentTime() ?? 0) || 0,
      wasPlaying: carousel.getIsPlaying(),
    };
  }, [imageCarouselRef]);
  const saveMarkersForCurrentAsset = useCallback(
    (nextMarkers: VideoMarker[], playback = getCurrentVideoPlayback()) => {
      const asset = currentAsset;
      if (!asset) return;

      setOptimisticMarkers((prev) => ({ ...prev, [asset.id]: nextMarkers }));
      if (playback) {
        imageCarouselRef.current?.requestRestorePlayback(playback);
      }

      apiClient
        .updateAssetMeta({
          datasetId,
          stackId,
          assetId: asset.id,
          meta: { ...(asset.meta || {}), markers: nextMarkers },
        })
        .then(async () => {
          await refetch();
          if (playback) {
            imageCarouselRef.current?.requestRestorePlayback(playback);
          }
        })
        .catch((err) => console.error('Failed to update markers:', err));
    },
    [currentAsset, datasetId, getCurrentVideoPlayback, imageCarouselRef, refetch, stackId]
  );
  const handleMoveMarker = useCallback(
    (index: number, time: number) => {
      const asset = currentAsset;
      if (!asset) return;
      const markers = getMarkersFor(asset).slice();
      if (index < 0 || index >= markers.length) return;
      const next = markers
        .map((marker, markerIndex) => (markerIndex === index ? { ...marker, time } : marker))
        .sort((left, right) => left.time - right.time);
      saveMarkersForCurrentAsset(next);
    },
    [currentAsset, getMarkersFor, saveMarkersForCurrentAsset]
  );
  const handleDeleteMarker = useCallback(
    (index: number) => {
      const asset = currentAsset;
      if (!asset) return;
      const markers = getMarkersFor(asset).slice();
      if (index < 0 || index >= markers.length) return;
      markers.splice(index, 1);
      saveMarkersForCurrentAsset(markers);
    },
    [currentAsset, getMarkersFor, saveMarkersForCurrentAsset]
  );
  const handleChangeMarkerColor = useCallback(
    (index: number, color: string) => {
      const asset = currentAsset;
      if (!asset) return;
      const markers = getMarkersFor(asset).slice();
      if (index < 0 || index >= markers.length) return;
      const next = markers.map((marker, markerIndex) =>
        markerIndex === index ? { ...marker, color } : marker
      );
      saveMarkersForCurrentAsset(next);
    },
    [currentAsset, getMarkersFor, saveMarkersForCurrentAsset]
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
      const carousel = imageCarouselRef.current;
      const isCurrentVideo = carousel?.isCurrentVideo() ?? false;
      if (e.key === 'Meta') {
        setIsMetaNativeMode(true);
      }
      if (e.key === 'Alt' && canUseImageTools) {
        e.preventDefault();
        setIsColorPickerAlt(true);
        return;
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
          carousel?.toggleVideo();
          return;
        }
        // Frame step: '.' next, ',' prev (then pause)
        if (e.key === '.') {
          e.preventDefault();
          carousel?.stepFrame(1);
          return;
        }
        if (e.key === ',') {
          e.preventDefault();
          carousel?.stepFrame(-1);
          return;
        }
        const lower = e.key.toLowerCase();
        // J/K: -1s / +1s (preserve playing state)
        if (lower === 'j') {
          carousel?.seekBySeconds(-1, true);
          return;
        }
        if (lower === 'k') {
          carousel?.seekBySeconds(1, true);
          return;
        }
        // h/l: to start / to last frame (preserve playing state)
        if (lower === 'h') {
          carousel?.seekToStart(true);
          return;
        }
        if (lower === 'l') {
          carousel?.seekToEnd(true);
          return;
        }
        if (lower === 'f') {
          e.preventDefault();
          void handleDownloadCurrentVideoFrame();
          return;
        }
        // m / Numpad *: add/edit marker at current time
        if (lower === 'm' || e.code === 'NumpadMultiply') {
          e.preventDefault();
          const t = Number(carousel?.getCurrentTime() ?? 0) || 0;
          const asset = currentAsset;
          if (!asset) return;
          // Preserve current playback state across updates
          const pb = { time: t, wasPlaying: carousel?.getIsPlaying() ?? false };
          const arr = getMarkersFor(asset);
          // 近接判定: ±0.15s 以内を「同一点」とみなして編集モードへ
          const threshold = 0.15;
          const hitIndex = arr.findIndex((m) => Math.abs(m.time - t) <= threshold);
          if (hitIndex >= 0) {
            openMarkerEditor(arr[hitIndex], hitIndex);
            // Keep playback state when editor opens
            imageCarouselRef.current?.requestRestorePlayback(pb);
            return;
          }
          // 近接無し → 追加して即保存（従来どおり）
          const existing = arr.slice();
          const newMarker: VideoMarker = { time: t, color: 'white', label: '' };
          const nextMarkers = [...existing, newMarker].sort((a, b) => a.time - b.time);
          setOptimisticMarkers((prev) => ({ ...prev, [asset.id]: nextMarkers }));
          // Immediate restore (guard against any incidental re-render)
          imageCarouselRef.current?.requestRestorePlayback(pb);
          apiClient
            .updateAssetMeta({
              datasetId,
              stackId,
              assetId: asset.id,
              meta: { ...(asset.meta || {}), markers: nextMarkers },
            })
            .then(async () => {
              await refetch();
              imageCarouselRef.current?.requestRestorePlayback(pb);
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
      if (e.key === 'Alt') {
        setIsColorPickerAlt(false);
      }
    };
    const handleBlur = () => {
      setIsMetaNativeMode(false);
      setIsColorPickerAlt(false);
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
    handleDownloadCurrentVideoFrame,
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
            message: t.grid.urlUploaded(successes.length),
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
        console.error('Failed to import URLs for stack', error);
        addNotification({ type: 'error', message: t.grid.urlUploadFailed });
      }
    },
    [stack, addNotification, refetch, queryClient, datasetId, t]
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
          <p className="text-xl mb-2">{t.viewer.stackNotFound}</p>
          <button
            onClick={navigateBack}
            className="px-4 py-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
          >
            {t.viewer.goBack}
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
        {embedded ? (
          // 本物の Header と同じ見た目のヘッダー。#header-actions を持つので、
          // ビューワーが portal で出す i/ペン/スポイトのボタン群がそのまま収まる
          <header
            className="fixed left-0 right-0 top-0 z-50 text-white backdrop-blur supports-[backdrop-filter]:backdrop-blur"
            style={{
              backgroundColor: `color-mix(in oklch, ${embeddedThemeColor ?? '#C7743C'} 80%, transparent)`,
            }}
          >
            <div className="relative flex h-14 items-center px-4">
              <div className="flex items-center gap-2">
                <HeaderIconButton onClick={navigateBack} aria-label="閉じる">
                  <X size={18} />
                </HeaderIconButton>
              </div>
              <div className="absolute left-1/2 max-w-[40%] -translate-x-1/2 truncate text-sm font-medium">
                {stack?.name ?? ''}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div id="header-actions" className="flex items-center gap-2" />
              </div>
            </div>
          </header>
        ) : null}

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
                ref={imageCarouselRef}
                currentAsset={currentAsset}
                nextAsset={nextAsset}
                prevAsset={prevAsset}
                markers={getMarkersFor(currentAsset)}
                onEditMarkerRequest={openMarkerEditor}
                onMoveMarkerRequest={handleMoveMarker}
                onDeleteMarkerRequest={handleDeleteMarker}
                onChangeMarkerColorRequest={handleChangeMarkerColor}
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
                  canUseZoomInteraction && !isViewerContextMenuOpen ? zoomWithWheel : undefined
                }
                onPinchStart={
                  canUseZoomInteraction && !isViewerContextMenuOpen ? startPinch : undefined
                }
                onPinchZoom={
                  canUseZoomInteraction && !isViewerContextMenuOpen ? updatePinch : undefined
                }
                onPinchEnd={
                  canUseZoomInteraction && !isViewerContextMenuOpen ? endPinch : undefined
                }
                onZoomPan={canUseZoomInteraction && !isViewerContextMenuOpen ? panBy : undefined}
                onDoubleTap={isZoomed ? resetZoom : undefined}
                onContextMenuCancelRequest={handleContextMenuCancelRequest}
                onCenterTap={() => {
                  // Move無しのクリック/タップ: 動画なら再生/停止をトグル
                  const carousel = imageCarouselRef.current;
                  if (carousel?.isCurrentVideo()) {
                    carousel.toggleVideo();
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
                        if (isUpward && !embedded) {
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
                {t.contextMenu.info}
              </button>
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-gray-100 hover:text-gray-700"
                onClick={handleContextMenuDownloadCurrent}
                role="menuitem"
              >
                <Download className="w-4 h-4 mr-2" />
                {t.viewer.downloadPage}
              </button>
              {isCurrentVideoAsset && (
                <button
                  type="button"
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-gray-100 hover:text-gray-700"
                  onClick={handleContextMenuDownloadCurrentFrame}
                  role="menuitem"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {t.viewer.downloadFrame}
                </button>
              )}
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-gray-100 hover:text-gray-700"
                onClick={handleContextMenuDownloadAll}
                role="menuitem"
              >
                <Download className="w-4 h-4 mr-2" />
                {t.info.downloadAll}
              </button>
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-gray-100 hover:text-gray-700"
                onClick={() => void handleContextMenuFindSimilar()}
                role="menuitem"
              >
                <GalleryVerticalEnd className="w-4 h-4 mr-2" />
                {t.contextMenu.findSimilar}
              </button>
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-gray-100 hover:text-gray-700"
                onClick={() => void handleContextMenuAddToScratch()}
                role="menuitem"
              >
                <NotebookText className="w-4 h-4 mr-2" />
                {t.contextMenu.addToScratch}
              </button>
              <div className="-mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-[13px] text-red-600 outline-none transition-colors hover:bg-gray-100 hover:text-red-600"
                onClick={handleContextMenuDelete}
                role="menuitem"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t.common.delete}
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
          aria-label={t.viewer.penMode}
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
          aria-label={t.viewer.colorPicker}
        >
          <Pipette size={18} />
        </HeaderIconButton>,
        document.getElementById('header-actions') || document.body
      )}

      {createPortal(
        <HeaderIconButton
          onClick={handleInfoSidebarToggle}
          isActive={isInfoSidebarOpen}
          aria-label={isInfoSidebarOpen ? t.viewer.closeInfo : t.viewer.openInfo}
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
            addNotification({ type: 'success', message: t.viewer.copiedHex(hex) });
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
              imageCarouselRef.current?.requestRestorePlayback(markerDialogPlaybackRef.current);
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
                imageCarouselRef.current?.requestRestorePlayback(markerDialogPlaybackRef.current);
              }
            }
          }}
          onSave={async ({ time, color }) => {
            const asset = currentAsset;
            if (!asset) return;
            const arr = getMarkersFor(asset).slice();
            const i = markerEditor.index;
            if (i < 0 || i >= arr.length) return;
            const updated: TVideoMarker = { ...arr[i], time, color };
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
                imageCarouselRef.current?.requestRestorePlayback(markerDialogPlaybackRef.current);
              }
            }
          }}
        />
      )}
    </ViewerShell>
  );
}
