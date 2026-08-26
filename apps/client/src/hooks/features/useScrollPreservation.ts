import { useCallback, useRef } from 'react';
import type { MediaGridItem } from '@/types';

interface AnchorItem {
  itemId: string;
  offsetFromViewportTop: number;
}

interface ViewportBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const VISIBLE_EPSILON = 0.5;

function getVisibleBounds(container: HTMLDivElement): ViewportBounds {
  const containerRect = container.getBoundingClientRect();

  return {
    top: Math.max(0, containerRect.top),
    right: Math.min(window.innerWidth, containerRect.right),
    bottom: Math.min(window.innerHeight, containerRect.bottom),
    left: Math.max(0, containerRect.left),
  };
}

function isFullyVisible(rect: DOMRect, bounds: ViewportBounds) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top >= bounds.top - VISIBLE_EPSILON &&
    rect.left >= bounds.left - VISIBLE_EPSILON &&
    rect.bottom <= bounds.bottom + VISIBLE_EPSILON &&
    rect.right <= bounds.right + VISIBLE_EPSILON
  );
}

function isPartiallyVisible(rect: DOMRect, bounds: ViewportBounds) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > bounds.top + VISIBLE_EPSILON &&
    rect.top < bounds.bottom - VISIBLE_EPSILON &&
    rect.right > bounds.left + VISIBLE_EPSILON &&
    rect.left < bounds.right - VISIBLE_EPSILON
  );
}

function isBeforeInReadingOrder(a: DOMRect, b: DOMRect) {
  if (Math.abs(a.top - b.top) > VISIBLE_EPSILON) {
    return a.top < b.top;
  }

  return a.left < b.left;
}

function findAnchorElement(
  container: HTMLDivElement,
  predicate: (rect: DOMRect, bounds: ViewportBounds) => boolean
): { itemId: string; rect: DOMRect } | null {
  const bounds = getVisibleBounds(container);
  let anchor: { itemId: string; rect: DOMRect } | null = null;

  for (const element of container.querySelectorAll('[data-item-id]')) {
    const itemId = element.getAttribute('data-item-id');
    if (!itemId) continue;

    const rect = element.getBoundingClientRect();
    if (!predicate(rect, bounds)) continue;

    if (!anchor || isBeforeInReadingOrder(rect, anchor.rect)) {
      anchor = { itemId, rect };
    }
  }

  return anchor;
}

function findElementByItemId(container: HTMLDivElement, itemId: string) {
  for (const element of container.querySelectorAll('[data-item-id]')) {
    if (element.getAttribute('data-item-id') === itemId) {
      return element as HTMLElement;
    }
  }

  return null;
}

export function useScrollPreservation() {
  const preservedAnchorItemRef = useRef<AnchorItem | null>(null);
  const isAnimatingRef = useRef<number>(0);
  const pendingTimeoutsRef = useRef<number[]>([]);

  const preserveAnchorItem = useCallback(
    (
      containerRef: React.RefObject<HTMLDivElement | null>,
      items: (MediaGridItem | undefined)[]
    ) => {
      const container = containerRef.current;

      if (!container || !items.length) {
        return;
      }

      const anchorElement =
        findAnchorElement(container, isFullyVisible) ??
        findAnchorElement(container, isPartiallyVisible);

      preservedAnchorItemRef.current = anchorElement
        ? {
            itemId: anchorElement.itemId,
            offsetFromViewportTop: anchorElement.rect.top,
          }
        : null;
    },
    []
  );

  const restoreAnchorItem = useCallback(
    (containerRef: React.RefObject<HTMLDivElement | null>, useWindowScroll = true) => {
      const container = containerRef.current;
      const anchorItem = preservedAnchorItemRef.current;
      if (!container || !anchorItem) {
        return false;
      }

      // トップ付近では復元しない（先頭挿入時に下へずれる誤補正を防ぐ）
      const scrollTop = useWindowScroll ? window.scrollY : container.scrollTop;
      if (scrollTop <= 2) {
        return false;
      }

      const el = findElementByItemId(container, anchorItem.itemId);
      if (!el) {
        return false;
      }

      const currentRect = el.getBoundingClientRect();
      const scrollAdjustment = currentRect.top - anchorItem.offsetFromViewportTop;

      if (Math.abs(scrollAdjustment) <= 1) {
        return false;
      }

      if (useWindowScroll) {
        window.scrollBy({ top: scrollAdjustment, behavior: 'auto' });
      } else {
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTop = Math.min(
          maxScrollTop,
          Math.max(0, container.scrollTop + scrollAdjustment)
        );
      }

      return true;
    },
    []
  );

  const maintainScrollDuringAnimation = useCallback(
    (
      containerRef: React.RefObject<HTMLDivElement | null>,
      isAnimating: boolean,
      useWindowScroll = true
    ) => {
      if (isAnimatingRef.current) {
        cancelAnimationFrame(isAnimatingRef.current);
        isAnimatingRef.current = 0;
      }

      // 前回分の遅延補正タイマーを破棄（積み重なりによる誤復元を防ぐ）
      for (const timeoutId of pendingTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
      pendingTimeoutsRef.current = [];

      const updateScrollPosition = () => {
        restoreAnchorItem(containerRef, useWindowScroll);

        if (isAnimating) {
          isAnimatingRef.current = window.requestAnimationFrame(updateScrollPosition);
        }
      };

      if (isAnimating) {
        isAnimatingRef.current = window.requestAnimationFrame(updateScrollPosition);
        return;
      }

      updateScrollPosition();
      const delays = [50, 100, 350];
      for (const delay of delays) {
        const timeoutId = window.setTimeout(() => {
          updateScrollPosition();
          if (delay === delays[delays.length - 1]) {
            // アニメーション完了後はアンカーを破棄し、以後の誤復元を防ぐ
            preservedAnchorItemRef.current = null;
          }
        }, delay);
        pendingTimeoutsRef.current.push(timeoutId);
      }
    },
    [restoreAnchorItem]
  );

  return {
    preservedAnchorItemRef,
    preserveAnchorItem,
    restoreAnchorItem,
    maintainScrollDuringAnimation,
  };
}
