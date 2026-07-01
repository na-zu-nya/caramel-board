import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useViewContext } from '@/hooks/useViewContext';
import { apiClient, isApiNotFoundError } from '@/lib/api-client';
import { getRepresentativeAsset, type ReadingUnit } from '@/lib/comic-reading';
import type { Asset, Stack } from '@/types';

export interface ImageCarouselBridge {
  prepareTranslateX: (value: number) => void;
  updateTranslateX: (value: number) => void;
  updateVerticalTransform: (y: number, scale: number, opacity: number, bg?: number) => void;
  getViewportWidth: () => number;
  getCurrentImageElement: () => HTMLImageElement | null;
  getCurrentZoomMediaElement: () => HTMLImageElement | HTMLVideoElement | null;
  getCurrentImageSurfaceElement: () => HTMLDivElement | null;
  isCurrentVideo: () => boolean;
  toggleVideo: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekBySeconds: (delta: number, preservePlaying?: boolean) => void;
  seekTo: (time: number, preservePlaying?: boolean) => void;
  stepFrame: (n: number) => void;
  seekToStart: (preservePlaying?: boolean) => void;
  seekToEnd: (preservePlaying?: boolean) => void;
  getCurrentTime: () => number;
  getIsPlaying: () => boolean;
  downloadCurrentVideoFrame: () => Promise<boolean>;
  requestRestorePlayback: (payload?: { time: number; wasPlaying: boolean }) => void;
}

export type ViewerEdgeKind = 'hard' | 'stack-boundary' | null;
export type ViewerEdgeSide = 'left' | 'right';

interface ViewerEdgeKinds {
  leftEdgeKind: ViewerEdgeKind;
  rightEdgeKind: ViewerEdgeKind;
}

interface PendingCrossStackAnimation {
  datasetId: string;
  stackId: string;
  listToken?: string;
  initialOffset: number;
  createdAt: number;
}

let pendingCrossStackAnimation: PendingCrossStackAnimation | null = null;

export function useStackViewerInteractions(params: {
  datasetId: string;
  mediaType: string;
  stackId: string;
  listToken?: string;
  returnTo?: string;
  stack?: Stack;
  readingUnits?: ReadingUnit[];
  openingDirection?: 'right-opening' | 'left-opening';
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  onHorizontalOffsetChange?: (offset: number, commitThreshold: number) => void;
  onHorizontalInteractionSettled?: () => void;
  onHorizontalPageTransitionCommit?: (payload: {
    targetPage: number;
    direction: 1 | -1;
    edgeKinds: ViewerEdgeKinds;
  }) => void;
  onBoundaryNavigationAttempt?: (payload: {
    side: ViewerEdgeSide;
    kind: Exclude<ViewerEdgeKind, null>;
  }) => boolean;
  // 埋め込み時はルート遷移の代わりに、隣接スタックへの切り替えをコールバックで通知する
  onNavigateStack?: (stackId: string) => void;
}) {
  const {
    datasetId,
    mediaType,
    stackId,
    listToken,
    returnTo,
    stack,
    readingUnits,
    openingDirection = 'right-opening',
    currentPage,
    setCurrentPage,
    onHorizontalOffsetChange,
    onHorizontalInteractionSettled,
    onHorizontalPageTransitionCommit,
    onBoundaryNavigationAttempt,
    onNavigateStack,
  } = params;
  const { ctx, restore, prefetchAround, moveIndex, removeIds } = useViewContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const restoredTokenRef = useRef<string | null>(null);
  const prefetchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (listToken && restoredTokenRef.current !== listToken) {
      restoredTokenRef.current = listToken;
      restore(listToken);
    }
    const key = `${datasetId}:${stackId}`;
    if (prefetchKeyRef.current !== key) {
      prefetchKeyRef.current = key;
      void prefetchAround(datasetId, 2);
    }
  }, [listToken, datasetId, stackId, restore, prefetchAround]);

  const imageCarouselRef = useRef<ImageCarouselBridge | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentDragOffsetRef = useRef(0);
  const currentVerticalOffsetRef = useRef(0);
  const crossStackEnabled = mediaType !== 'comic';

  const numericStackId = Number.parseInt(String(stackId), 10);
  const index = ctx ? ctx.ids.indexOf(numericStackId) : -1;
  // 隣接スタックは常に一覧順で決める。openingDirection はスタック内部のページ方向だけに使う。
  const nextNeighborId =
    index >= 0 && index < (ctx?.ids.length ?? 0) - 1 ? ctx!.ids[index + 1] : undefined;
  const prevNeighborId = index > 0 ? ctx!.ids[index - 1] : undefined;

  const getStackQueryKey = useCallback(
    (targetStackId: number | string) => ['stack', datasetId, String(targetStackId)] as const,
    [datasetId]
  );
  const fetchStackForCache = useCallback(
    (targetStackId: number | string) => apiClient.getStack(String(targetStackId), datasetId),
    [datasetId]
  );
  const retryNeighborStackQuery = useCallback(
    (failureCount: number, error: unknown) => !isApiNotFoundError(error) && failureCount < 2,
    []
  );
  const { data: nextNeighborStack, error: nextNeighborError } = useQuery({
    queryKey: nextNeighborId !== undefined ? getStackQueryKey(nextNeighborId) : ['noop-next'],
    queryFn: () => fetchStackForCache(nextNeighborId!),
    enabled: crossStackEnabled && nextNeighborId !== undefined,
    retry: retryNeighborStackQuery,
    staleTime: 60_000,
  });
  const { data: prevNeighborStack, error: prevNeighborError } = useQuery({
    queryKey: prevNeighborId !== undefined ? getStackQueryKey(prevNeighborId) : ['noop-prev'],
    queryFn: () => fetchStackForCache(prevNeighborId!),
    enabled: crossStackEnabled && prevNeighborId !== undefined,
    retry: retryNeighborStackQuery,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (nextNeighborId !== undefined && isApiNotFoundError(nextNeighborError)) {
      removeIds([nextNeighborId]);
    }
  }, [nextNeighborError, nextNeighborId, removeIds]);

  useEffect(() => {
    if (prevNeighborId !== undefined && isApiNotFoundError(prevNeighborError)) {
      removeIds([prevNeighborId]);
    }
  }, [prevNeighborError, prevNeighborId, removeIds]);

  const prefetchStack = useCallback(
    async (targetStackId: number | undefined) => {
      if (targetStackId === undefined) return false;
      try {
        await queryClient.ensureQueryData({
          queryKey: getStackQueryKey(targetStackId),
          queryFn: () => fetchStackForCache(targetStackId),
          staleTime: 60_000,
        });
        return true;
      } catch (error) {
        if (isApiNotFoundError(error)) {
          removeIds([targetStackId]);
          return false;
        }
        return true;
      }
    },
    [fetchStackForCache, getStackQueryKey, queryClient, removeIds]
  );

  const currentUnit = readingUnits?.[currentPage];
  const nextUnit = readingUnits?.[currentPage + 1];
  const prevUnit = currentPage > 0 ? readingUnits?.[currentPage - 1] : undefined;
  const unitCount = readingUnits?.length ?? stack?.assets.length ?? 0;
  const hasNextInStack = currentPage < unitCount - 1;
  const hasPrevInStack = currentPage > 0;
  const hasInternalLeftPage =
    openingDirection === 'right-opening' ? hasNextInStack : hasPrevInStack;
  const hasInternalRightPage =
    openingDirection === 'right-opening' ? hasPrevInStack : hasNextInStack;
  const currentAsset: Asset | undefined = currentUnit
    ? getRepresentativeAsset(currentUnit)
    : stack?.assets?.[currentPage];
  const getStackNeighborAssetForSide = (side: ViewerEdgeSide) => {
    const neighborStack = side === 'left' ? prevNeighborStack : nextNeighborStack;
    return neighborStack?.assets?.[0];
  };
  const hasLegacyNextAsset = Boolean(
    stack && !readingUnits && currentPage < stack.assets.length - 1
  );
  const hasLegacyPrevAsset = Boolean(stack && !readingUnits && currentPage > 0);
  const nextSlotCandidateStackNeighborSide: ViewerEdgeSide | undefined =
    !nextUnit && !hasLegacyNextAsset && crossStackEnabled
      ? openingDirection === 'right-opening'
        ? 'left'
        : 'right'
      : undefined;
  const prevSlotCandidateStackNeighborSide: ViewerEdgeSide | undefined =
    !prevUnit && !hasLegacyPrevAsset && crossStackEnabled
      ? openingDirection === 'right-opening'
        ? 'right'
        : 'left'
      : undefined;
  const nextSlotStackNeighborAsset = nextSlotCandidateStackNeighborSide
    ? getStackNeighborAssetForSide(nextSlotCandidateStackNeighborSide)
    : undefined;
  const prevSlotStackNeighborAsset = prevSlotCandidateStackNeighborSide
    ? getStackNeighborAssetForSide(prevSlotCandidateStackNeighborSide)
    : undefined;
  const nextStackNeighborSide = nextSlotStackNeighborAsset
    ? nextSlotCandidateStackNeighborSide
    : undefined;
  const prevStackNeighborSide = prevSlotStackNeighborAsset
    ? prevSlotCandidateStackNeighborSide
    : undefined;
  const nextAsset: Asset | undefined = (() => {
    if (!stack) return undefined;
    if (nextUnit) return getRepresentativeAsset(nextUnit);
    if (hasLegacyNextAsset) return stack.assets[currentPage + 1];
    if (!crossStackEnabled) return undefined;
    return nextSlotStackNeighborAsset;
  })();
  const prevAsset: Asset | undefined = (() => {
    if (!stack) return undefined;
    if (prevUnit) return getRepresentativeAsset(prevUnit);
    if (hasLegacyPrevAsset) return stack.assets[currentPage - 1];
    if (!crossStackEnabled) return undefined;
    return prevSlotStackNeighborAsset;
  })();

  const getEdgeKindsForPage = useCallback(
    (page: number): ViewerEdgeKinds => {
      const pageHasNextInStack = page < unitCount - 1;
      const pageHasPrevInStack = page > 0;
      const pageHasInternalLeft =
        openingDirection === 'right-opening' ? pageHasNextInStack : pageHasPrevInStack;
      const pageHasInternalRight =
        openingDirection === 'right-opening' ? pageHasPrevInStack : pageHasNextInStack;
      const pageCanGoLeft =
        pageHasInternalLeft || (crossStackEnabled && prevNeighborId !== undefined);
      const pageCanGoRight =
        pageHasInternalRight || (crossStackEnabled && nextNeighborId !== undefined);
      const hasHardEdgeContext = unitCount > 1;

      const leftEdgeKind: ViewerEdgeKind = pageCanGoLeft
        ? !pageHasInternalLeft && crossStackEnabled && prevNeighborId !== undefined
          ? 'stack-boundary'
          : null
        : hasHardEdgeContext
          ? 'hard'
          : null;
      const rightEdgeKind: ViewerEdgeKind = pageCanGoRight
        ? !pageHasInternalRight && crossStackEnabled && nextNeighborId !== undefined
          ? 'stack-boundary'
          : null
        : hasHardEdgeContext
          ? 'hard'
          : null;

      return { leftEdgeKind, rightEdgeKind };
    },
    [crossStackEnabled, nextNeighborId, openingDirection, prevNeighborId, unitCount]
  );
  const { leftEdgeKind, rightEdgeKind } = getEdgeKindsForPage(currentPage);
  const canGoLeft = hasInternalLeftPage || (crossStackEnabled && prevNeighborId !== undefined);
  const canGoRight = hasInternalRightPage || (crossStackEnabled && nextNeighborId !== undefined);

  const lerp = useCallback((current: number, target: number, factor: number) => {
    return current + (target - current) * factor;
  }, []);

  const getHorizontalCommitThreshold = useCallback(() => {
    const viewportWidth = imageCarouselRef.current?.getViewportWidth() ?? window.innerWidth;
    return viewportWidth * 0.3;
  }, []);

  const notifyHorizontalOffsetChange = useCallback(
    (offset: number) => {
      onHorizontalOffsetChange?.(offset, getHorizontalCommitThreshold());
    },
    [getHorizontalCommitThreshold, onHorizontalOffsetChange]
  );

  useLayoutEffect(() => {
    currentDragOffsetRef.current = 0;
    imageCarouselRef.current?.prepareTranslateX(0);
    imageCarouselRef.current?.updateTranslateX(0);
    notifyHorizontalOffsetChange(0);
    currentVerticalOffsetRef.current = 0;
    imageCarouselRef.current?.updateVerticalTransform(0, 1, 1, 0);
  }, [notifyHorizontalOffsetChange]);

  const animateToCenter = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const step = () => {
      const current = currentDragOffsetRef.current;
      const next = lerp(current, 0, 0.15);
      if (Math.abs(next) < 0.5) {
        currentDragOffsetRef.current = 0;
        imageCarouselRef.current?.prepareTranslateX(0);
        imageCarouselRef.current?.updateTranslateX(0);
        notifyHorizontalOffsetChange(0);
        animationFrameRef.current = null;
        onHorizontalInteractionSettled?.();
        return;
      }
      currentDragOffsetRef.current = next;
      imageCarouselRef.current?.updateTranslateX(next);
      notifyHorizontalOffsetChange(next);
      animationFrameRef.current = requestAnimationFrame(step);
    };
    animationFrameRef.current = requestAnimationFrame(step);
  }, [lerp, notifyHorizontalOffsetChange, onHorizontalInteractionSettled]);

  const animateToOffset = useCallback(
    (targetOffset: number, onComplete?: () => void) => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      const step = () => {
        const current = currentDragOffsetRef.current;
        const next = lerp(current, targetOffset, 0.3);
        if (Math.abs(next - targetOffset) < 0.5) {
          currentDragOffsetRef.current = targetOffset;
          imageCarouselRef.current?.updateTranslateX(targetOffset);
          notifyHorizontalOffsetChange(targetOffset);
          animationFrameRef.current = null;
          onComplete?.();
          return;
        }
        currentDragOffsetRef.current = next;
        imageCarouselRef.current?.updateTranslateX(next);
        notifyHorizontalOffsetChange(next);
        animationFrameRef.current = requestAnimationFrame(step);
      };
      animationFrameRef.current = requestAnimationFrame(step);
    },
    [lerp, notifyHorizontalOffsetChange]
  );

  useLayoutEffect(() => {
    const pending = pendingCrossStackAnimation;
    if (!pending) return;
    if (pending.datasetId !== datasetId) return;
    if (pending.stackId !== String(stackId)) return;
    if (pending.listToken !== listToken) return;
    if (!stack || !imageCarouselRef.current) return;
    if (Date.now() - pending.createdAt > 1500) {
      pendingCrossStackAnimation = null;
      return;
    }

    pendingCrossStackAnimation = null;
    currentDragOffsetRef.current = pending.initialOffset;
    imageCarouselRef.current.prepareTranslateX(pending.initialOffset);
    imageCarouselRef.current.updateTranslateX(pending.initialOffset);
    notifyHorizontalOffsetChange(pending.initialOffset);
    animateToOffset(0, () => {
      onHorizontalInteractionSettled?.();
    });
  }, [
    animateToOffset,
    datasetId,
    listToken,
    notifyHorizontalOffsetChange,
    onHorizontalInteractionSettled,
    stack,
    stackId,
  ]);

  const commitPageChange = useCallback(
    (direction: 1 | -1) => {
      currentDragOffsetRef.current = 0;
      imageCarouselRef.current?.prepareTranslateX(0);
      notifyHorizontalOffsetChange(0);
      setCurrentPage((page) => page + direction);
    },
    [notifyHorizontalOffsetChange, setCurrentPage]
  );

  const notifyPageTransitionCommit = useCallback(
    (direction: 1 | -1) => {
      const targetPage = Math.min(Math.max(currentPage + direction, 0), Math.max(unitCount - 1, 0));
      onHorizontalPageTransitionCommit?.({
        targetPage,
        direction,
        edgeKinds: getEdgeKindsForPage(targetPage),
      });
    },
    [currentPage, getEdgeKindsForPage, onHorizontalPageTransitionCommit, unitCount]
  );

  const shouldAllowBoundaryNavigation = useCallback(
    (side: ViewerEdgeSide, kind: ViewerEdgeKind) => {
      if (!kind) return true;
      return onBoundaryNavigationAttempt?.({ side, kind }) ?? true;
    },
    [onBoundaryNavigationAttempt]
  );

  const getPageOffset = useCallback(
    (direction: 1 | -1) => {
      const viewportWidth = imageCarouselRef.current?.getViewportWidth() ?? window.innerWidth;
      const directionSign = openingDirection === 'right-opening' ? 1 : -1;
      return direction * directionSign * viewportWidth;
    },
    [openingDirection]
  );

  const animateHorizontalPageChange = useCallback(
    (direction: 1 | -1) => {
      const pageOffset = getPageOffset(direction);
      const initialOffset = -pageOffset;

      currentDragOffsetRef.current = initialOffset;
      imageCarouselRef.current?.prepareTranslateX(initialOffset);
      // アニメーション中の追加入力を、見えている遷移先ページ基準で処理する。
      flushSync(() => {
        setCurrentPage((page) => page + direction);
      });
      imageCarouselRef.current?.updateTranslateX(initialOffset);
      notifyHorizontalOffsetChange(initialOffset);
      animateToOffset(0, () => {
        onHorizontalInteractionSettled?.();
      });
    },
    [
      animateToOffset,
      getPageOffset,
      notifyHorizontalOffsetChange,
      onHorizontalInteractionSettled,
      setCurrentPage,
    ]
  );

  const getStackOffset = useCallback((listDelta: 1 | -1) => {
    const viewportWidth = imageCarouselRef.current?.getViewportWidth() ?? window.innerWidth;
    return listDelta > 0 ? -viewportWidth : viewportWidth;
  }, []);

  const navigateCrossStackWithAnimation = useCallback(
    (listDelta: 1 | -1, targetStackId: number) => {
      const stackOffset = getStackOffset(listDelta);
      const initialOffset = -stackOffset;

      currentDragOffsetRef.current = initialOffset;
      imageCarouselRef.current?.prepareTranslateX(initialOffset);
      notifyHorizontalOffsetChange(initialOffset);
      void prefetchStack(targetStackId);
      pendingCrossStackAnimation = {
        datasetId,
        stackId: String(targetStackId),
        listToken,
        initialOffset,
        createdAt: Date.now(),
      };

      flushSync(() => {
        if (ctx) moveIndex(listDelta);
        if (onNavigateStack) {
          onNavigateStack(String(targetStackId));
        }
      });

      if (onNavigateStack) {
        return;
      }

      navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId, stackId: String(targetStackId) },
        search: { page: 0, mediaType, listToken, returnTo },
        replace: true,
      });
    },
    [
      ctx,
      datasetId,
      getStackOffset,
      listToken,
      mediaType,
      moveIndex,
      navigate,
      notifyHorizontalOffsetChange,
      onNavigateStack,
      prefetchStack,
      returnTo,
    ]
  );

  const prefetchAdjacentStackChain = useCallback(
    (listDelta: 1 | -1, targetStackId: number) => {
      void prefetchStack(targetStackId);
      if (!ctx) return;

      const chainIndex = index + listDelta * 2;
      if (chainIndex < 0 || chainIndex >= ctx.ids.length) return;

      const chainId = ctx.ids[chainIndex];
      void prefetchStack(chainId);
    },
    [ctx, index, prefetchStack]
  );

  const goToAdjacentStack = useCallback(
    (listDelta: 1 | -1) => {
      if (!crossStackEnabled) return false;

      const targetStackId = listDelta > 0 ? nextNeighborId : prevNeighborId;
      if (targetStackId === undefined) return false;

      const numericTargetStackId = Number(targetStackId);
      prefetchAdjacentStackChain(listDelta, numericTargetStackId);
      navigateCrossStackWithAnimation(listDelta, numericTargetStackId);
      return true;
    },
    [
      crossStackEnabled,
      navigateCrossStackWithAnimation,
      nextNeighborId,
      prefetchAdjacentStackChain,
      prevNeighborId,
    ]
  );

  const getPageDeltaFromDrag = useCallback(
    (totalDelta: number): 1 | -1 => {
      if (openingDirection === 'right-opening') {
        return totalDelta > 0 ? 1 : -1;
      }
      return totalDelta < 0 ? 1 : -1;
    },
    [openingDirection]
  );

  const onDrag = useCallback(
    (deltaX: number) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      currentDragOffsetRef.current += deltaX;
      imageCarouselRef.current?.updateTranslateX(currentDragOffsetRef.current);
      notifyHorizontalOffsetChange(currentDragOffsetRef.current);
      if (crossStackEnabled) {
        if (deltaX < 0 && rightEdgeKind === 'stack-boundary' && nextNeighborId) {
          void prefetchStack(nextNeighborId);
        } else if (deltaX > 0 && leftEdgeKind === 'stack-boundary' && prevNeighborId) {
          void prefetchStack(prevNeighborId);
        }
      }
    },
    [
      crossStackEnabled,
      leftEdgeKind,
      nextNeighborId,
      notifyHorizontalOffsetChange,
      prefetchStack,
      prevNeighborId,
      rightEdgeKind,
    ]
  );

  const onDragEnd = useCallback(
    (totalDelta: number, velocity: number) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      const viewportWidth = imageCarouselRef.current?.getViewportWidth() ?? window.innerWidth;
      const threshold = viewportWidth * 0.3;
      const velocityThreshold = 300;

      const effectiveDelta = currentDragOffsetRef.current || totalDelta;
      const isVelocityCommit = Math.abs(velocity) > velocityThreshold;
      const intentDelta = isVelocityCommit ? velocity : effectiveDelta;

      if (Math.abs(effectiveDelta) <= threshold && !isVelocityCommit) {
        animateToCenter();
        return;
      }

      const pageDelta = getPageDeltaFromDrag(intentDelta);
      if (pageDelta > 0 && hasNextInStack) {
        notifyPageTransitionCommit(1);
        animateHorizontalPageChange(1);
        return;
      }
      if (pageDelta < 0 && hasPrevInStack) {
        notifyPageTransitionCommit(-1);
        animateHorizontalPageChange(-1);
        return;
      }

      const dragSide: ViewerEdgeSide = intentDelta < 0 ? 'right' : 'left';
      const dragSideEdgeKind = dragSide === 'left' ? leftEdgeKind : rightEdgeKind;

      if (!crossStackEnabled) {
        shouldAllowBoundaryNavigation(dragSide, dragSideEdgeKind);
        animateToCenter();
        return;
      }

      if (dragSide === 'left' && prevNeighborId !== undefined) {
        if (!shouldAllowBoundaryNavigation(dragSide, dragSideEdgeKind)) {
          animateToCenter();
          return;
        }
        prefetchAdjacentStackChain(-1, Number(prevNeighborId));
        navigateCrossStackWithAnimation(-1, Number(prevNeighborId));
        return;
      }

      if (dragSide === 'right' && nextNeighborId !== undefined) {
        if (!shouldAllowBoundaryNavigation(dragSide, dragSideEdgeKind)) {
          animateToCenter();
          return;
        }
        prefetchAdjacentStackChain(1, Number(nextNeighborId));
        navigateCrossStackWithAnimation(1, Number(nextNeighborId));
        return;
      }

      shouldAllowBoundaryNavigation(dragSide, dragSideEdgeKind);
      animateToCenter();
    },
    [
      animateHorizontalPageChange,
      animateToCenter,
      crossStackEnabled,
      getPageDeltaFromDrag,
      hasNextInStack,
      hasPrevInStack,
      leftEdgeKind,
      navigateCrossStackWithAnimation,
      nextNeighborId,
      notifyPageTransitionCommit,
      prefetchAdjacentStackChain,
      prevNeighborId,
      rightEdgeKind,
      shouldAllowBoundaryNavigation,
    ]
  );

  const goByPageDelta = useCallback(
    (pageDelta: 1 | -1, side: ViewerEdgeSide) => {
      if (pageDelta > 0 && hasNextInStack) {
        notifyPageTransitionCommit(1);
        commitPageChange(1);
        return;
      }
      if (pageDelta < 0 && hasPrevInStack) {
        notifyPageTransitionCommit(-1);
        commitPageChange(-1);
        return;
      }
      const sideEdgeKind = side === 'left' ? leftEdgeKind : rightEdgeKind;
      if (side === 'right' && crossStackEnabled && nextNeighborId !== undefined) {
        if (!shouldAllowBoundaryNavigation(side, sideEdgeKind)) return;
        navigateCrossStackWithAnimation(1, Number(nextNeighborId));
        return;
      }
      if (side === 'left' && crossStackEnabled && prevNeighborId !== undefined) {
        if (!shouldAllowBoundaryNavigation(side, sideEdgeKind)) return;
        navigateCrossStackWithAnimation(-1, Number(prevNeighborId));
        return;
      }
      shouldAllowBoundaryNavigation(side, sideEdgeKind);
    },
    [
      commitPageChange,
      crossStackEnabled,
      hasNextInStack,
      hasPrevInStack,
      leftEdgeKind,
      navigateCrossStackWithAnimation,
      nextNeighborId,
      notifyPageTransitionCommit,
      prevNeighborId,
      rightEdgeKind,
      shouldAllowBoundaryNavigation,
    ]
  );

  const onLeftTap = useCallback(() => {
    goByPageDelta(openingDirection === 'right-opening' ? 1 : -1, 'left');
  }, [goByPageDelta, openingDirection]);

  const onRightTap = useCallback(() => {
    goByPageDelta(openingDirection === 'right-opening' ? -1 : 1, 'right');
  }, [goByPageDelta, openingDirection]);

  const onNextStack = useCallback(() => goToAdjacentStack(1), [goToAdjacentStack]);

  const onPrevStack = useCallback(() => goToAdjacentStack(-1), [goToAdjacentStack]);

  useEffect(() => {
    if (!stack || !crossStackEnabled) return;
    const last = unitCount - 1;
    if (currentPage <= 1 || currentPage >= last - 1) {
      void prefetchAround(datasetId, 2);
    }
  }, [stack, crossStackEnabled, currentPage, unitCount, datasetId, prefetchAround]);

  return {
    imageCarouselRef,
    currentAsset,
    nextAsset,
    prevAsset,
    currentUnit,
    nextUnit,
    prevUnit,
    nextStackNeighborSide,
    prevStackNeighborSide,
    canGoLeft,
    canGoRight,
    leftEdgeKind,
    rightEdgeKind,
    onDrag,
    onDragEnd,
    onLeftTap,
    onRightTap,
    onNextStack,
    onPrevStack,
  };
}
