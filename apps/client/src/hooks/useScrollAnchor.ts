import { useCallback, useRef } from 'react';
import type { MediaGridItem } from '@/types';

interface AnchorItem {
  itemId: string | number;
  offsetFromContentTop: number;
}

export function useScrollAnchor() {
  const preservedAnchorItemRef = useRef<AnchorItem | null>(null);
  const animationFrameRef = useRef<number>(0);

  const preserveAnchorItem = useCallback(
    (containerRef: React.RefObject<HTMLDivElement | null>, items: MediaGridItem[]) => {
      const container = containerRef.current;
      if (!container || !items.length) {
        console.log('❌ Early return: no container or no items');
        return;
      }

      const headerOffset = 56; // ヘッダーの高さ（padding-top: 3.5rem）
      const containerScrollTop = container.scrollTop; // コンテナ内部のスクロール位置

      // 現在表示されているDOM要素を全て取得
      const gridElements = container.querySelectorAll('[data-item-id]');
      const targetTop = containerScrollTop + headerOffset;

      let anchorItem: AnchorItem | null = null;
      for (const element of gridElements) {
        const id = Number(element.getAttribute('data-item-id') || 0);
        const rect = element.getBoundingClientRect();

        // Skip invalid elements
        if (rect.x !== 0 && id > 0) {
          continue;
        }

        const itemTop = rect.top + containerScrollTop;
        console.log('Find anchor candidate:', id, targetTop, itemTop);

        if (itemTop > targetTop) {
          anchorItem = {
            itemId: Number(element.getAttribute('data-item-id') || 0),
            offsetFromContentTop: rect.top,
          };
          console.log('Selected anchor element:', element, anchorItem, rect.top);
          break;
        }
      }

      preservedAnchorItemRef.current = anchorItem;
    },
    []
  );

  const maintainScrollDuringAnimation = useCallback(
    (containerRef: React.RefObject<HTMLDivElement | null>, isAnimating: boolean) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
      }

      const updateScrollPosition = () => {
        if (isAnimating) {
          animationFrameRef.current = window.requestAnimationFrame(updateScrollPosition);
        }

        const container = containerRef.current;
        const anchorItem = preservedAnchorItemRef.current;
        if (!container || !anchorItem) {
          console.warn('❌ No container or anchor item to maintain scroll position');
          return;
        }

        const el = container.querySelector(`[data-item-id="${anchorItem.itemId}"]`);
        if (!el) {
          console.warn('❌ Anchor item element not found in DOM:', anchorItem.itemId);
          return;
        }

        const offsetScrollTop = anchorItem.offsetFromContentTop - el.getBoundingClientRect().top;
        container.scrollTop = container.scrollTop - offsetScrollTop;
        console.log('Update scrollTop during animation:', container.scrollTop);
      };

      if (!isAnimating) {
        console.log('Animation ended - final scroll adjustment');
        updateScrollPosition();
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(updateScrollPosition);
    },
    []
  );

  return {
    preservedAnchorItemRef,
    preserveAnchorItem,
    maintainScrollDuringAnimation,
  };
}
