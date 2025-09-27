import { useCallback, useRef } from 'react';
import type { MediaGridItem } from '@/types';

interface AnchorItem {
  itemId: string | number;
  offsetFromViewportTop: number; // ビューポートの上端からの相対位置
}

export function useScrollPreservation() {
  const preservedAnchorItemRef = useRef<AnchorItem | null>(null);
  const isAnimatingRef = useRef<number>(0);

  const preserveAnchorItem = useCallback(
    (
      containerRef: React.RefObject<HTMLDivElement | null>,
      items: (MediaGridItem | undefined)[]
    ) => {
      const container = containerRef.current;

      if (!container || !items.length) {
        return;
      }

      // 現在表示されているDOM要素を全て取得
      const gridElements = container.querySelectorAll('[data-item-id]');

      // ビューポートの中央付近にあるアイテムを探す
      const viewportHeight = window.innerHeight;
      const viewportCenter = viewportHeight / 2;

      let closestItem: AnchorItem | null = null;
      let closestDistance = Infinity;

      for (const element of gridElements) {
        const id = Number(element.getAttribute('data-item-id') || 0);
        const rect = element.getBoundingClientRect();

        // 左端の最初のアイテムのみを対象にする（グリッドの場合）
        if (rect.x !== 0 && id > 0) {
          continue;
        }

        // ビューポート内に表示されているアイテムのみを考慮
        if (rect.top >= 0 && rect.top <= viewportHeight) {
          const distanceFromCenter = Math.abs(rect.top - viewportCenter);

          if (distanceFromCenter < closestDistance) {
            closestDistance = distanceFromCenter;
            closestItem = {
              itemId: id,
              offsetFromViewportTop: rect.top,
            };
          }
        }
      }

      // 中央付近にアイテムがない場合は、最初の可視アイテムを使用
      if (!closestItem) {
        for (const element of gridElements) {
          const id = Number(element.getAttribute('data-item-id') || 0);
          const rect = element.getBoundingClientRect();

          if (rect.x === 0 && rect.top >= 0) {
            closestItem = {
              itemId: id,
              offsetFromViewportTop: rect.top,
            };
            break;
          }
        }
      }

      preservedAnchorItemRef.current = closestItem;
    },
    []
  );

  // 現在アンカーされているアイテムによって、スクロール位置を保持する
  const maintainScrollDuringAnimation = useCallback(
    (containerRef: React.RefObject<HTMLDivElement | null>, isAnimating: boolean) => {
      if (isAnimatingRef.current) {
        cancelAnimationFrame(isAnimatingRef.current);
        isAnimatingRef.current = 0;
      }

      const updateScrollPosition = () => {
        const container = containerRef.current;
        const anchorItem = preservedAnchorItemRef.current;
        if (!anchorItem) {
          return;
        }

        const root: Document | HTMLElement = document;
        const el = (container || document.body).querySelector?.(
          `[data-item-id="${anchorItem.itemId}"]`
        ) as HTMLElement | null;
        if (!el) {
          return;
        }

        const currentRect = el.getBoundingClientRect();
        const scrollAdjustment = currentRect.top - anchorItem.offsetFromViewportTop;

        // スクロール位置を調整（container がスクロール不可なら window を調整）
        if (Math.abs(scrollAdjustment) > 1) {
          // 1px以上のズレがある場合のみ調整
          if (container && container.scrollHeight > container.clientHeight + 1) {
            container.scrollTop = container.scrollTop + scrollAdjustment;
          } else {
            window.scrollBy({ top: scrollAdjustment, behavior: 'auto' });
          }
        }

        // アニメーション中は継続的に更新
        if (isAnimating) {
          isAnimatingRef.current = window.requestAnimationFrame(updateScrollPosition);
        }
      };

      if (isAnimating) {
        // アニメーション開始時
        isAnimatingRef.current = window.requestAnimationFrame(updateScrollPosition);
      } else {
        // アニメーション終了時 - 最終調整を複数回実行して確実に位置を合わせる
        const finalAdjustments = [50, 100, 350]; // トランジション中と完了後に調整
        finalAdjustments.forEach((delay) => {
          setTimeout(() => {
            updateScrollPosition();
          }, delay);
        });
      }
    },
    []
  );

  return {
    preservedAnchorItemRef,
    preserveAnchorItem,
    maintainScrollDuringAnimation,
  };
}
