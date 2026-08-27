import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  clampStackGridColumns,
  readStackGridColumns,
  writeStackGridColumns,
} from '@/lib/grid-layout-settings';
import { getSelectedMediaGridStackIds } from '@/lib/media-grid-selection';
import { patchAssetInPageCaches, patchStackInPageCaches } from '@/lib/stack-cache-patch';
import {
  infoSidebarOpenAtom,
  selectedItemIdAtom,
  selectionModeAtom,
  sidebarOpenAtom,
} from '@/stores/ui';
import type { MediaGridItem } from '@/types';
import { useThrottle } from '../utils/useThrottle';
import { useAnimationState } from './useAnimationState';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useScrollPreservation } from './useScrollPreservation';
import { useSelectionMode } from './useSelectionMode';

interface UseStackGridProps {
  items: (MediaGridItem | undefined)[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error?: any;
  onLoadRange?: (startIndex: number, endIndex: number) => void;
  onRefreshAll?: () => Promise<void>;
  onItemClick?: (item: MediaGridItem, event?: React.MouseEvent) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  useWindowScroll?: boolean;
  keyboardShortcutsDisabled?: boolean;
}

// 表示領域バッファ（上下に追加で描画する行数）
const BUFFER_ROWS = 4;
// 画面に常に下方向へ確保する余白（実描画レンジ）
const EXTRA_ROWS_BELOW = 1; // 下に1行は常に可視レンジへ含める
// 先読み用の追加行数（描画範囲の外まで読み込む）
const PREFETCH_ROWS_ABOVE = 1; // 上方向にも1段先読み
const PREFETCH_ROWS_BELOW = 2; // 下方向に2段先読み
const SCROLL_THROTTLE_MS = 150;

function getContainerContentWidth(container: HTMLDivElement | null) {
  if (!container) return window.innerWidth;
  const style = window.getComputedStyle(container);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  return Math.max(1, container.clientWidth - paddingLeft - paddingRight);
}

interface EditUpdates {
  addTags?: string[];
  removeTags?: string[];
  setAuthor?: string;
  setCategory?: 'image' | 'books' | 'video';
}

export function useStackGrid({
  items,
  total,
  onLoadRange,
  onRefreshAll,
  containerRef: externalContainerRef,
  useWindowScroll = true,
  keyboardShortcutsDisabled,
}: UseStackGridProps) {
  const [isSelectionMode] = useAtom(selectionModeAtom);
  const [sidebarOpen] = useAtom(sidebarOpenAtom);
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const [selectedItemId, setSelectedItemId] = useAtom(selectedItemIdAtom);
  // const [minColumns] = useAtom(minColumnsAtom);
  // const [minItemSize] = useAtom(minItemSizeAtom);
  const queryClient = useQueryClient();
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  // アニメーション終了検知エフェクトから最新の items を参照するための ref（依存配列に items を含めないため）
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [rangeStart, setRangeStart] = useState<number>(0);
  const [rangeEnd, setRangeEnd] = useState<number>(50); // Start with some items visible
  const [columnsPerRow, setColumnsPerRowState] = useState(() => readStackGridColumns());
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window === 'undefined' ? 1 : window.innerWidth
  );
  const containerWidthRef = useRef(containerWidth);
  containerWidthRef.current = containerWidth;

  // Scroll preservation
  const { preserveAnchorItem, restoreAnchorItem, maintainScrollDuringAnimation } =
    useScrollPreservation();

  // Selection mode
  const {
    selectedItems,
    setSelectedItems,
    selectedItemOrder,
    isEditPanelOpen,
    setIsEditPanelOpen,
    toggleItemSelection,
    selectItemRange,
    clearSelection,
    exitSelectionMode,
  } = useSelectionMode(isSelectionMode);

  // Animation state
  const isSidebarAnimating = useAnimationState(sidebarOpen);
  const isRightPanelAnimating = useAnimationState([
    infoSidebarOpen,
    isEditPanelOpen,
    isSelectionMode,
  ]);
  const isCurrentlyAnimating = isSidebarAnimating || isRightPanelAnimating;

  // Calculate dynamic columns and item size
  const itemSize = containerWidth / Math.max(columnsPerRow, 1);
  const totalContentHeight = Math.ceil(total / Math.max(columnsPerRow, 1)) * itemSize;
  const disableVirtualization = total <= columnsPerRow * 3;
  const updateContainerWidth = useCallback(() => {
    const container = containerRef.current;
    const nextWidth = getContainerContentWidth(container);
    if (Math.abs(containerWidthRef.current - nextWidth) < 0.5) return;

    preserveAnchorItem(containerRef, itemsRef.current);

    containerWidthRef.current = nextWidth;
    setContainerWidth(nextWidth);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const currentContainer = containerRef.current;
        if (!currentContainer) return;

        restoreAnchorItem(containerRef, useWindowScroll);
        if (useWindowScroll) {
          window.dispatchEvent(new Event('scroll'));
          return;
        }

        currentContainer.dispatchEvent(new Event('scroll'));
      });
    });
  }, [containerRef, preserveAnchorItem, restoreAnchorItem, useWindowScroll]);

  // Create visible items array from the full sparse items array
  const finalVisibleItems: (MediaGridItem | undefined)[] = [];

  if (disableVirtualization) {
    const limit = Math.max(total, items.length);
    for (let i = 0; i < limit; i++) {
      finalVisibleItems.push(items[i]);
    }
  } else {
    for (let i = rangeStart; i < rangeEnd && i < total; i++) {
      finalVisibleItems.push(items[i]);
    }
  }
  const hasVisibleItemGaps = total > 0 && finalVisibleItems.some((item) => item === undefined);

  const topSpacerHeight = disableVirtualization
    ? 0
    : Math.floor(rangeStart / columnsPerRow) * itemSize;
  const bottomSpacerHeight = disableVirtualization
    ? 0
    : Math.max(
        0,
        totalContentHeight -
          topSpacerHeight -
          Math.ceil((rangeEnd - rangeStart) / columnsPerRow) * itemSize
      );

  // Keyboard shortcuts
  useKeyboardShortcuts({
    isEditPanelOpen,
    onToggleEditPanel: () => setIsEditPanelOpen(!isEditPanelOpen),
    hasSelectedItems: selectedItems.size > 0,
    enabled: !keyboardShortcutsDisabled,
  });

  // Create throttled version of onLoadRange
  const throttledLoadRange = useThrottle((startIndex: number, endIndex: number) => {
    if (onLoadRange && !disableVirtualization) {
      // Load only the requested range
      onLoadRange(startIndex, endIndex);
    }
  }, SCROLL_THROTTLE_MS);

  useEffect(() => {
    if (
      !onLoadRange ||
      disableVirtualization ||
      !hasVisibleItemGaps ||
      total === 0 ||
      isCurrentlyAnimating
    ) {
      return;
    }

    const requestStartIndex = Math.max(0, rangeStart - PREFETCH_ROWS_ABOVE * columnsPerRow);
    const requestEndInclusive = Math.min(
      Math.max(0, total - 1),
      rangeEnd - 1 + PREFETCH_ROWS_BELOW * columnsPerRow
    );
    const retryVisibleRange = () => {
      onLoadRange(requestStartIndex, requestEndInclusive);
    };

    const timeoutId = window.setTimeout(retryVisibleRange, 1200);
    const intervalId = window.setInterval(retryVisibleRange, 6000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [
    columnsPerRow,
    disableVirtualization,
    hasVisibleItemGaps,
    isCurrentlyAnimating,
    onLoadRange,
    rangeEnd,
    rangeStart,
    total,
  ]);

  useEffect(() => {
    if (disableVirtualization) {
      setRangeStart(0);
      setRangeEnd(Math.max(total, items.length));
    }
  }, [disableVirtualization, total, items.length]);

  // Optimistic favorite UI state
  const [favoriteOverrides, setFavoriteOverrides] = useState<Map<string | number, boolean>>(
    () => new Map()
  );
  const [favoritePending, setFavoritePending] = useState<Set<string | number>>(() => new Set());

  // Favorite mutation (server-side)
  const favoriteMutation = useMutation({
    mutationFn: async ({
      stackId,
      favorited,
    }: {
      stackId: string | number;
      favorited: boolean;
    }) => {
      const response = await fetch(`/api/v1/stacks/${stackId}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorited }),
      });
      if (!response.ok) throw new Error('Failed to toggle favorite');
      return response.json();
    },
    onSuccess: () => {
      // Keep UI responsive; still refresh relevant caches in background
      void queryClient.invalidateQueries({ queryKey: ['stacks'] });
      void queryClient.invalidateQueries({ queryKey: ['favorite-items'] });
    },
  });

  const updateBounds = useCallback(() => {
    if (!onLoadRange || disableVirtualization) {
      setRangeStart((current) => (current === 0 ? current : 0));
      setRangeEnd((current) => {
        const next = Math.max(total, items.length);
        return current === next ? current : next;
      });
      return;
    }

    if (isCurrentlyAnimating) {
      return;
    }

    // When there are zero results, avoid repeatedly issuing loadRange requests.
    // Callers should explicitly trigger initial fetch; here we suppress further requests.
    if (total === 0) {
      setRangeStart((current) => (current === 0 ? current : 0));
      setRangeEnd((current) => (current === 0 ? current : 0));
      return;
    }

    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();

    // 可視領域（ビューポートとコンテナの交差）を正確に算出
    let visibleTopPx = 0; // コンテナ先頭からの可視上端（px）
    let visibleHeightPx = 0; // 可視領域の高さ（px）

    if (useWindowScroll) {
      if (!rect) return;
      // 上端はコンテナ基準のスクロール量
      visibleTopPx = Math.max(0, -rect.top);
      // 可視高はビューポートとコンテナ矩形の交差
      const viewportTop = 0;
      const viewportBottom = window.innerHeight;
      const top = Math.max(rect.top, viewportTop);
      const bottom = Math.min(rect.bottom, viewportBottom);
      visibleHeightPx = Math.max(0, bottom - top);
    } else {
      if (!container) return;
      visibleTopPx = Math.max(0, container.scrollTop);
      visibleHeightPx = container.clientHeight;
    }

    const totalRows = Math.ceil(Math.max(1, total) / columnsPerRow);
    const startRow = Math.max(0, Math.floor(visibleTopPx / itemSize) - BUFFER_ROWS);
    // 最終可視行（inclusive）+ バッファ + 下方向の余白を含める
    const lastVisibleRow = Math.floor(
      Math.max(0, visibleTopPx + Math.max(0, visibleHeightPx) - 1) / itemSize
    );
    const endRowInclusive = Math.min(
      totalRows - 1,
      lastVisibleRow + BUFFER_ROWS + EXTRA_ROWS_BELOW
    );

    const newStartIndex = startRow * columnsPerRow;
    // rangeEnd は exclusive。inclusive 行→exclusive index へ変換
    const newEndExclusive = (endRowInclusive + 1) * columnsPerRow;

    setRangeStart((current) => (current === newStartIndex ? current : newStartIndex));
    setRangeEnd((current) => (current === newEndExclusive ? current : newEndExclusive));

    // 読み込みリクエストは可視レンジより少し広めに出す（下1段先読み）
    const requestStartIndex = Math.max(0, newStartIndex - PREFETCH_ROWS_ABOVE * columnsPerRow);
    const requestEndInclusive = Math.min(
      Math.max(0, total - 1),
      newEndExclusive - 1 + PREFETCH_ROWS_BELOW * columnsPerRow
    );
    throttledLoadRange(requestStartIndex, requestEndInclusive);
  }, [
    onLoadRange,
    total,
    itemSize,
    isCurrentlyAnimating,
    throttledLoadRange,
    useWindowScroll,
    disableVirtualization,
    items.length,
    columnsPerRow,
    containerRef.current,
  ]);

  const updateContainerWidthRef = useRef(updateContainerWidth);
  updateContainerWidthRef.current = updateContainerWidth;
  const updateBoundsRef = useRef(updateBounds);
  updateBoundsRef.current = updateBounds;

  // Handle animation state changes
  useEffect(() => {
    if (!disableVirtualization && isCurrentlyAnimating) {
      preserveAnchorItem(containerRef, itemsRef.current);
    }
    if (!disableVirtualization) {
      maintainScrollDuringAnimation(containerRef, isCurrentlyAnimating, useWindowScroll);
    }
  }, [
    isCurrentlyAnimating,
    maintainScrollDuringAnimation,
    preserveAnchorItem,
    containerRef,
    disableVirtualization,
    useWindowScroll,
  ]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    let scheduledFrame: number | null = null;

    const updateLayout = () => {
      updateContainerWidthRef.current();
      if (!disableVirtualization) {
        updateBoundsRef.current();
      }
    };

    const scheduleLayoutUpdate = () => {
      if (scheduledFrame !== null) return;
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = null;
        updateLayout();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleLayoutUpdate);

    if (container) {
      resizeObserver.observe(container);
    }

    // スクロールリスナーは body/window へ（useWindowScroll時）
    if (!disableVirtualization) {
      if (useWindowScroll) {
        window.addEventListener('scroll', scheduleLayoutUpdate, { passive: true });
      } else if (container) {
        container.addEventListener('scroll', scheduleLayoutUpdate, { passive: true });
      }
    }

    // 初期計算
    updateLayout();
    window.addEventListener('resize', scheduleLayoutUpdate);

    return () => {
      resizeObserver.disconnect();
      if (scheduledFrame !== null) {
        window.cancelAnimationFrame(scheduledFrame);
      }
      if (!disableVirtualization) {
        if (useWindowScroll) {
          window.removeEventListener('scroll', scheduleLayoutUpdate);
        } else if (container) {
          container.removeEventListener('scroll', scheduleLayoutUpdate);
        }
      }
      window.removeEventListener('resize', scheduleLayoutUpdate);
    };
  }, [containerRef, useWindowScroll, disableVirtualization]);

  const setGridColumns = useCallback(
    (value: number) => {
      const nextColumns = clampStackGridColumns(value);
      if (nextColumns === columnsPerRow) return;

      // 左上基準のリサイズ: ビューポート最上段・左端のアイテムを基準に、
      // 変更後もそのアイテムの縦位置が保たれるよう幾何学的にスクロールを補正する。
      // （DOMアンカー方式は最上段が切れていると2段目を掴む・仮想化で要素が消えると
      //   復元に失敗するため、規則配置を前提に計算で求める）
      const container = containerRef.current;
      let anchor: { index: number; viewportOffset: number } | null = null;
      if (container && itemSize > 0) {
        const rect = container.getBoundingClientRect();
        const visibleTopPx = useWindowScroll
          ? Math.max(0, -rect.top)
          : Math.max(0, container.scrollTop);
        const row = Math.floor(visibleTopPx / itemSize);
        anchor = {
          index: row * columnsPerRow,
          // その行の上端とビューポート上端の差（0以下 = 行が少し上に切れている状態を保存）
          viewportOffset: row * itemSize - visibleTopPx,
        };
      }

      setColumnsPerRowState(nextColumns);
      writeStackGridColumns(nextColumns);

      // 新しい列数がレイアウトへ反映されてからスクロールを合わせる（既存と同じ double-rAF）
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const currentContainer = containerRef.current;
          if (!currentContainer || !anchor) return;

          const newItemSize = getContainerContentWidth(currentContainer) / Math.max(nextColumns, 1);
          const newRow = Math.floor(anchor.index / nextColumns);
          const newVisibleTop = Math.max(0, newRow * newItemSize - anchor.viewportOffset);

          if (useWindowScroll) {
            const rect = currentContainer.getBoundingClientRect();
            const containerTop = rect.top + window.scrollY;
            window.scrollTo(0, Math.max(0, containerTop + newVisibleTop));
            window.dispatchEvent(new Event('scroll'));
            return;
          }

          currentContainer.scrollTop = newVisibleTop;
          currentContainer.dispatchEvent(new Event('scroll'));
        });
      });
    },
    [columnsPerRow, containerRef, itemSize, useWindowScroll]
  );

  // Handlers
  const handleFavoriteToggle = useCallback(
    async (item: MediaGridItem, event: React.MouseEvent) => {
      event.stopPropagation();
      const id = item.id;
      const favoriteKind = item.favoriteKind;
      const targetId =
        favoriteKind === 'asset' && item.assetId !== undefined ? item.assetId : item.id;
      const currentFavorited = favoriteOverrides.has(id)
        ? (favoriteOverrides.get(id) as boolean)
        : (item.favorited ?? item.isFavorite ?? false);
      const nextFavorited = !currentFavorited;

      // Optimistically update local override and mark as pending
      setFavoriteOverrides((prev) => new Map(prev).set(id, nextFavorited));
      setFavoritePending((prev) => new Set(prev).add(id));

      // Also optimistically patch any loaded paged caches to keep views consistent
      const favoritePatch = { favorited: nextFavorited, isFavorite: nextFavorited };
      if (favoriteKind === 'asset') {
        patchAssetInPageCaches(queryClient, targetId, favoritePatch);
      } else {
        patchStackInPageCaches(queryClient, id, favoritePatch);
      }

      try {
        if (favoriteKind === 'asset') {
          await apiClient.toggleAssetFavorite(targetId, nextFavorited);
          await queryClient.invalidateQueries({ queryKey: ['favorite-items'] });
        } else {
          await favoriteMutation.mutateAsync({ stackId: id, favorited: nextFavorited });
        }
      } catch (err) {
        // Revert optimistic override on failure
        setFavoriteOverrides((prev) => new Map(prev).set(id, currentFavorited));
        console.error('Failed to toggle favorite:', err);
      } finally {
        setFavoritePending((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [favoriteMutation, favoriteOverrides, queryClient]
  );

  const handleItemClick = useCallback(
    (item: MediaGridItem, onItemClick?: (item: MediaGridItem) => void) => {
      if (isSelectionMode) {
        toggleItemSelection(item.id);
        return;
      }

      if (infoSidebarOpen) {
        setSelectedItemId(item.id);
        return;
      }

      if (onItemClick) {
        onItemClick(item);
      }
    },
    [isSelectionMode, infoSidebarOpen, toggleItemSelection, setSelectedItemId]
  );

  const applyEditUpdates = useCallback(
    async (updates: EditUpdates) => {
      if (selectedItems.size === 0) return;

      const stackIds = getSelectedMediaGridStackIds(selectedItemOrder, items);

      if (stackIds.length === 0) return;

      let hasMutation = false;

      try {
        if (updates.addTags && updates.addTags.length > 0) {
          await apiClient.bulkAddTags(stackIds, updates.addTags);
          hasMutation = true;
        }

        if (updates.setAuthor) {
          await apiClient.bulkSetAuthor(stackIds, updates.setAuthor);
          hasMutation = true;
        }

        if (updates.setCategory) {
          await apiClient.bulkSetCategory(stackIds, updates.setCategory);
          hasMutation = true;
        }

        if (hasMutation) {
          clearSelection();
          exitSelectionMode();
          if (onRefreshAll) {
            await onRefreshAll();
          } else {
            void queryClient.invalidateQueries({ queryKey: ['stacks'] });
          }
        }
      } catch (error) {
        console.error('Error applying bulk updates:', error);
      }
    },
    [
      selectedItems,
      selectedItemOrder,
      items,
      clearSelection,
      exitSelectionMode,
      onRefreshAll,
      queryClient,
    ]
  );

  return {
    // Refs
    containerRef,
    // State
    sidebarOpen,
    infoSidebarOpen,
    setInfoSidebarOpen,
    isSelectionMode,
    selectedItemId,
    selectedItems,
    setSelectedItems,
    selectedItemOrder,
    isEditPanelOpen,
    columnsPerRow,
    rangeStart,
    rangeEnd,
    // Layout calculations
    totalContentHeight,
    finalVisibleItems,
    topSpacerHeight,
    bottomSpacerHeight,
    // Additional properties for compatibility
    scrollPosition: 0, // Mock value - not used in sparse grid
    itemsPerRow: columnsPerRow,
    itemSize,
    setGridColumns,
    // Favorite optimistic state
    favoriteOverrides,
    favoriteStates: favoritePending,
    // Handlers
    handleItemClick,
    handleFavoriteToggle,
    handleToggleSelection: toggleItemSelection,
    selectItemRange,
    handleToggleFavorite: handleFavoriteToggle,
    handleSelectAll: () => {}, // Not implemented in useStackGrid
    handleDeselectAll: clearSelection,
    handleInfoSidebarOpen: setInfoSidebarOpen,
    applyEditUpdates,
    closeEditPanel: () => setIsEditPanelOpen(false),
    isSidebarAnimating: false, // Not implemented in useStackGrid
    toggleItemSelection,
    setIsEditPanelOpen,
    clearSelection,
    exitSelectionMode,
    onRefreshAll,
    // Mutation global state (unused by callers now)
    isFavoritePending: favoriteMutation.isPending,
  };
}
