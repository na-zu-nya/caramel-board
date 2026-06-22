import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useViewContext } from '@/hooks/useViewContext';
import { apiClient } from '@/lib/api-client';
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

export function useStackViewerInteractions(params: {
  datasetId: string;
  mediaType: string;
  stackId: string;
  listToken?: string;
  returnTo?: string;
  stack?: Stack;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
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
    currentPage,
    setCurrentPage,
    onNavigateStack,
  } = params;
  const { ctx, restore, prefetchAround, moveIndex } = useViewContext();
  const navigate = useNavigate();

  // Restore context when listToken available
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

  // Neighbors based on latest URL + context ids
  const numericStackId = Number.parseInt(String(stackId), 10);
  const index = ctx ? ctx.ids.indexOf(numericStackId) : -1;
  const nextNeighborId =
    index >= 0 && index < (ctx?.ids.length ?? 0) - 1 ? ctx!.ids[index + 1] : undefined;
  const prevNeighborId = index > 0 ? ctx!.ids[index - 1] : undefined;

  // Neighbor stacks for preview
  const { data: nextNeighborStack } = useQuery({
    queryKey: nextNeighborId ? ['stack', datasetId, String(nextNeighborId)] : ['noop-next'],
    queryFn: () => apiClient.getStack(String(nextNeighborId!), datasetId),
    enabled: crossStackEnabled && !!nextNeighborId,
    staleTime: 60_000,
  });
  const { data: prevNeighborStack } = useQuery({
    queryKey: prevNeighborId ? ['stack', datasetId, String(prevNeighborId)] : ['noop-prev'],
    queryFn: () => apiClient.getStack(String(prevNeighborId!), datasetId),
    enabled: crossStackEnabled && !!prevNeighborId,
    staleTime: 60_000,
  });

  // Asset triplet for carousel
  const currentAsset: Asset | undefined = stack?.assets?.[currentPage];
  const nextAsset: Asset | undefined = (() => {
    if (!stack) return undefined;
    if (currentPage < stack.assets.length - 1) return stack.assets[currentPage + 1];
    if (!crossStackEnabled) return undefined;
    return nextNeighborStack?.assets?.[0];
  })();
  const prevAsset: Asset | undefined = (() => {
    if (!stack) return undefined;
    if (currentPage > 0) return stack.assets[currentPage - 1];
    if (!crossStackEnabled) return undefined;
    const assets = prevNeighborStack?.assets || [];
    return assets.length > 0 ? assets[assets.length - 1] : undefined;
  })();

  // Resets
  useLayoutEffect(() => {
    currentDragOffsetRef.current = 0;
    imageCarouselRef.current?.prepareTranslateX(0);
    imageCarouselRef.current?.updateTranslateX(0);
    currentVerticalOffsetRef.current = 0;
    imageCarouselRef.current?.updateVerticalTransform(0, 1, 1, 0);
  }, []);

  // Helpers
  const lerp = useCallback((c: number, t: number, f: number) => c + (t - c) * f, []);

  const animateToCenter = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const step = () => {
      const cur = currentDragOffsetRef.current;
      const nx = lerp(cur, 0, 0.15);
      if (Math.abs(nx) < 0.5) {
        currentDragOffsetRef.current = 0;
        imageCarouselRef.current?.prepareTranslateX(0);
        imageCarouselRef.current?.updateTranslateX(0);
        animationFrameRef.current = null;
        return;
      }
      currentDragOffsetRef.current = nx;
      imageCarouselRef.current?.updateTranslateX(nx);
      animationFrameRef.current = requestAnimationFrame(step);
    };
    animationFrameRef.current = requestAnimationFrame(step);
  }, [lerp]);

  const animateToOffset = useCallback(
    (targetOffset: number, onComplete?: () => void) => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      const step = () => {
        const cur = currentDragOffsetRef.current;
        const nx = lerp(cur, targetOffset, 0.3);
        if (Math.abs(nx - targetOffset) < 0.5) {
          currentDragOffsetRef.current = targetOffset;
          imageCarouselRef.current?.updateTranslateX(targetOffset);
          animationFrameRef.current = null;
          onComplete?.();
          return;
        }
        currentDragOffsetRef.current = nx;
        imageCarouselRef.current?.updateTranslateX(nx);
        animationFrameRef.current = requestAnimationFrame(step);
      };
      animationFrameRef.current = requestAnimationFrame(step);
    },
    [lerp]
  );

  const commitPageChange = useCallback(
    (direction: 1 | -1) => {
      currentDragOffsetRef.current = 0;
      imageCarouselRef.current?.prepareTranslateX(0);
      setCurrentPage((page) => page + direction);
    },
    [setCurrentPage]
  );

  const animateHorizontalPageChange = useCallback(
    (direction: 1 | -1) => {
      const viewportW = imageCarouselRef.current?.getViewportWidth() ?? window.innerWidth;
      const targetOffset = direction === 1 ? viewportW : -viewportW;
      animateToOffset(targetOffset, () => commitPageChange(direction));
    },
    [animateToOffset, commitPageChange]
  );

  const navigateCrossStackAfterAnimation = useCallback(
    (direction: 1 | -1, targetStackId: number) => {
      const viewportW = imageCarouselRef.current?.getViewportWidth() ?? window.innerWidth;
      const targetOffset = direction === 1 ? viewportW : -viewportW;
      animateToOffset(targetOffset, () => {
        currentDragOffsetRef.current = 0;
        imageCarouselRef.current?.prepareTranslateX(0);
        if (ctx) moveIndex(direction);
        if (onNavigateStack) {
          // 埋め込み時: 親に stackId 切り替えを通知(ルート遷移しない)
          onNavigateStack(String(targetStackId));
        } else {
          navigate({
            to: '/library/$datasetId/stacks/$stackId',
            params: { datasetId, stackId: String(targetStackId) },
            search: { page: 0, mediaType, listToken, returnTo },
            replace: true,
          });
        }
      });
    },
    [
      animateToOffset,
      ctx,
      datasetId,
      listToken,
      mediaType,
      moveIndex,
      navigate,
      onNavigateStack,
      returnTo,
    ]
  );

  // Drag handlers
  const onDrag = useCallback(
    (deltaX: number) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      currentDragOffsetRef.current += deltaX;
      imageCarouselRef.current?.updateTranslateX(currentDragOffsetRef.current);
      // Early prefetch when heading to edge
      if (crossStackEnabled) {
        if (
          deltaX > 0 &&
          ((stack && currentPage === stack.assets.length - 1) || !stack) &&
          nextNeighborId
        ) {
          void apiClient.getStack(String(nextNeighborId), datasetId);
        } else if (deltaX < 0 && ((stack && currentPage === 0) || !stack) && prevNeighborId) {
          void apiClient.getStack(String(prevNeighborId), datasetId);
        }
      }
    },
    [crossStackEnabled, stack, currentPage, nextNeighborId, prevNeighborId, datasetId]
  );

  const onDragEnd = useCallback(
    (totalDelta: number, velocity: number) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      const viewportW2 = imageCarouselRef.current?.getViewportWidth() ?? window.innerWidth;
      const threshold = viewportW2 * 0.3;
      const velocityThreshold = 300;

      if (Math.abs(totalDelta) > threshold || Math.abs(velocity) > velocityThreshold) {
        if (totalDelta < 0 && currentPage > 0) {
          // left drag → previous
          animateHorizontalPageChange(-1);
        } else if (totalDelta > 0 && stack && currentPage < stack.assets.length - 1) {
          // right drag → next
          animateHorizontalPageChange(1);
        } else if (crossStackEnabled) {
          if (totalDelta < 0) {
            // left drag at start → previous stack
            if (prevNeighborId !== undefined) {
              void apiClient.getStack(String(prevNeighborId), datasetId);
              if (ctx && index - 2 >= 0) {
                const chainId = ctx.ids[index - 2];
                if (chainId !== undefined) void apiClient.getStack(String(chainId), datasetId);
              }
              navigateCrossStackAfterAnimation(-1, Number(prevNeighborId));
            } else {
              animateToCenter();
            }
          } else {
            // right drag at end → next stack
            if (nextNeighborId !== undefined) {
              void apiClient.getStack(String(nextNeighborId), datasetId);
              if (ctx && index + 2 < (ctx.ids?.length ?? 0)) {
                const chainId = ctx.ids[index + 2];
                if (chainId !== undefined) void apiClient.getStack(String(chainId), datasetId);
              }
              navigateCrossStackAfterAnimation(1, Number(nextNeighborId));
            } else {
              animateToCenter();
            }
          }
        } else {
          animateToCenter();
        }
      } else {
        animateToCenter();
      }
    },
    [
      animateHorizontalPageChange,
      crossStackEnabled,
      currentPage,
      stack,
      animateToCenter,
      nextNeighborId,
      prevNeighborId,
      datasetId,
      ctx,
      index,
      navigateCrossStackAfterAnimation,
    ]
  );

  // Tap handlers (keyboard rules live in component)
  const onLeftTap = useCallback(() => {
    // left tap → next
    if (stack && currentPage < stack.assets.length - 1) {
      commitPageChange(1);
    } else if (crossStackEnabled && nextNeighborId !== undefined) {
      navigateCrossStackAfterAnimation(1, Number(nextNeighborId));
    }
  }, [
    stack,
    currentPage,
    crossStackEnabled,
    nextNeighborId,
    commitPageChange,
    navigateCrossStackAfterAnimation,
  ]);

  const onRightTap = useCallback(() => {
    // right tap → previous
    if (currentPage > 0) {
      commitPageChange(-1);
    } else if (crossStackEnabled && prevNeighborId !== undefined) {
      navigateCrossStackAfterAnimation(-1, Number(prevNeighborId));
    }
  }, [
    currentPage,
    crossStackEnabled,
    prevNeighborId,
    commitPageChange,
    navigateCrossStackAfterAnimation,
  ]);

  // Near-edge aggressive prefetch
  useEffect(() => {
    if (!stack || !crossStackEnabled) return;
    const last = stack.assets.length - 1;
    if (currentPage <= 1 || currentPage >= last - 1) {
      void prefetchAround(datasetId, 2);
    }
  }, [stack, crossStackEnabled, currentPage, datasetId, prefetchAround]);

  return {
    imageCarouselRef,
    currentAsset,
    nextAsset,
    prevAsset,
    onDrag,
    onDragEnd,
    onLeftTap,
    onRightTap,
  };
}
