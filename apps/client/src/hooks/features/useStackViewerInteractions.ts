import { apiClient } from '@/lib/api-client';
import { useViewContext } from '@/hooks/useViewContext';
import type { Asset, Stack } from '@/types';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ImageCarouselBridge {
  updateTranslateX: (value: number) => void;
  updateVerticalTransform: (y: number, scale: number, opacity: number, bg?: number) => void;
  getViewportWidth: () => number;
  getCurrentImageElement: () => HTMLImageElement | null;
}

export function useStackViewerInteractions(params: {
  datasetId: string;
  mediaType: string;
  stackId: string;
  listToken?: string;
  stack?: Stack;
  currentPage: number;
  setCurrentPage: (fn: (p: number) => number | number) => void;
}) {
  const { datasetId, mediaType, stackId, listToken, stack, currentPage, setCurrentPage } = params;
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
  const [dragOffset, setDragOffset] = useState(0);
  const crossStackEnabled = mediaType !== 'comic';
  const skipResetOnceRef = useRef(false);

  // Neighbors based on latest URL + context ids
  const numericStackId = Number.parseInt(String(stackId), 10);
  const index = ctx ? ctx.ids.indexOf(numericStackId) : -1;
  const nextNeighborId = index >= 0 && index < (ctx?.ids.length ?? 0) - 1 ? ctx!.ids[index + 1] : undefined;
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
    if (skipResetOnceRef.current) {
      skipResetOnceRef.current = false;
      return;
    }
    currentDragOffsetRef.current = 0;
    imageCarouselRef.current?.updateTranslateX(0);
    setDragOffset(0);
    currentVerticalOffsetRef.current = 0;
    imageCarouselRef.current?.updateVerticalTransform(0, 1, 1, 0);
  }, [stackId]);

  // Helpers
  const lerp = useCallback((c: number, t: number, f: number) => c + (t - c) * f, []);

  const animateToCenter = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const step = () => {
      const cur = currentDragOffsetRef.current;
      const nx = lerp(cur, 0, 0.15);
      if (Math.abs(nx) < 0.5) {
        currentDragOffsetRef.current = 0;
        imageCarouselRef.current?.updateTranslateX(0);
        setDragOffset(0);
        animationFrameRef.current = null;
        return;
      }
      currentDragOffsetRef.current = nx;
      imageCarouselRef.current?.updateTranslateX(nx);
      animationFrameRef.current = requestAnimationFrame(step);
    };
    animationFrameRef.current = requestAnimationFrame(step);
  }, [lerp]);

  const animateHorizontalPageChange = useCallback((direction: 1 | -1) => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const viewportW = imageCarouselRef.current?.getViewportWidth() ?? window.innerWidth;
    const d = currentDragOffsetRef.current;
    const startOffset = direction === 1 ? d - viewportW : d + viewportW;
    requestAnimationFrame(() => {
      setCurrentPage((p) => p + direction);
      requestAnimationFrame(() => {
        currentDragOffsetRef.current = startOffset;
        setDragOffset(startOffset);
        imageCarouselRef.current?.updateTranslateX(startOffset);
        const step = () => {
          const cur = currentDragOffsetRef.current;
          const nx = lerp(cur, 0, 0.3);
          if (Math.abs(nx) < 0.5) {
            currentDragOffsetRef.current = 0;
            imageCarouselRef.current?.updateTranslateX(0);
            setDragOffset(0);
            animationFrameRef.current = null;
            return;
          }
          currentDragOffsetRef.current = nx;
          imageCarouselRef.current?.updateTranslateX(nx);
          animationFrameRef.current = requestAnimationFrame(step);
        };
        animationFrameRef.current = requestAnimationFrame(step);
      });
    });
  }, [lerp, setCurrentPage]);

  const navigateCrossStackImmediate = useCallback((direction: 1 | -1, targetStackId: number) => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const viewportW = imageCarouselRef.current?.getViewportWidth() ?? window.innerWidth;
    const d = currentDragOffsetRef.current;
    const startOffset = direction === 1 ? d - viewportW : d + viewportW;
    skipResetOnceRef.current = true;
    if (ctx) moveIndex(direction);
    navigate({
      to: '/library/$datasetId/stacks/$stackId',
      params: { datasetId, stackId: String(targetStackId) },
      search: { page: 0, mediaType, listToken },
      replace: true,
    });
    requestAnimationFrame(() => {
      currentDragOffsetRef.current = startOffset;
      setDragOffset(startOffset);
      imageCarouselRef.current?.updateTranslateX(startOffset);
      const step = () => {
        const cur = currentDragOffsetRef.current;
        const nx = lerp(cur, 0, 0.3);
        if (Math.abs(nx) < 0.5) {
          currentDragOffsetRef.current = 0;
          imageCarouselRef.current?.updateTranslateX(0);
          setDragOffset(0);
          animationFrameRef.current = null;
          return;
        }
        currentDragOffsetRef.current = nx;
        imageCarouselRef.current?.updateTranslateX(nx);
        animationFrameRef.current = requestAnimationFrame(step);
      };
      animationFrameRef.current = requestAnimationFrame(step);
    });
  }, [ctx, moveIndex, navigate, datasetId, mediaType, listToken, lerp]);

  // Drag handlers
  const onDrag = useCallback((deltaX: number) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    currentDragOffsetRef.current += deltaX;
    imageCarouselRef.current?.updateTranslateX(currentDragOffsetRef.current);
    // Early prefetch when heading to edge
    if (crossStackEnabled) {
      if (deltaX > 0 && ((stack && currentPage === stack.assets.length - 1) || !stack) && nextNeighborId) {
        void apiClient.getStack(String(nextNeighborId), datasetId);
      } else if (deltaX < 0 && ((stack && currentPage === 0) || !stack) && prevNeighborId) {
        void apiClient.getStack(String(prevNeighborId), datasetId);
      }
    }
  }, [crossStackEnabled, stack, currentPage, nextNeighborId, prevNeighborId, datasetId]);

  const onDragEnd = useCallback((totalDelta: number, velocity: number) => {
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
            navigateCrossStackImmediate(-1, Number(prevNeighborId));
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
            navigateCrossStackImmediate(1, Number(nextNeighborId));
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
  }, [animateHorizontalPageChange, crossStackEnabled, currentPage, stack, animateToCenter, nextNeighborId, prevNeighborId, datasetId, ctx, index, navigateCrossStackImmediate]);

  // Tap handlers (keyboard rules live in component)
  const onLeftTap = useCallback(() => {
    // left tap → next
    if (stack && currentPage < stack.assets.length - 1) {
      setCurrentPage((p) => p + 1);
      currentDragOffsetRef.current = 0;
      imageCarouselRef.current?.updateTranslateX(0);
      setDragOffset(0);
    } else if (crossStackEnabled && nextNeighborId !== undefined) {
      navigateCrossStackImmediate(1, Number(nextNeighborId));
    }
  }, [stack, currentPage, crossStackEnabled, nextNeighborId, navigateCrossStackImmediate, setCurrentPage]);

  const onRightTap = useCallback(() => {
    // right tap → previous
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
      currentDragOffsetRef.current = 0;
      imageCarouselRef.current?.updateTranslateX(0);
      setDragOffset(0);
    } else if (crossStackEnabled && prevNeighborId !== undefined) {
      navigateCrossStackImmediate(-1, Number(prevNeighborId));
    }
  }, [currentPage, crossStackEnabled, prevNeighborId, navigateCrossStackImmediate, setCurrentPage]);

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
    dragOffset,
    setDragOffset,
    currentAsset,
    nextAsset,
    prevAsset,
    onDrag,
    onDragEnd,
    onLeftTap,
    onRightTap,
  };
}
