import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  clampStackGridColumns,
  readStackGridColumns,
  writeStackGridColumns,
} from '@/lib/grid-layout-settings';
import { getSelectedMediaGridStackIds } from '@/lib/media-grid-selection';
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
}

// 表示領域バッファ（上下に追加で描画する行数）
const BUFFER_ROWS = 2;
// 画面に常に下方向へ確保する余白（実描画レンジ）
const EXTRA_ROWS_BELOW = 1; // 下に1行は常に可視レンジへ含める
// 先読み用の追加行数（描画範囲の外まで読み込む）
const PREFETCH_ROWS_ABOVE = 0;
const PREFETCH_ROWS_BELOW = 1; // 下方向に1段先読み
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
  setMediaType?: 'image' | 'comic' | 'video';
}

export function useStackGrid({
  items,
  total,
  onLoadRange,
  onRefreshAll,
  containerRef: externalContainerRef,
  useWindowScroll = true,
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
  const [rangeStart, setRangeStart] = useState<number>(0);
  const [rangeEnd, setRangeEnd] = useState<number>(50); // Start with some items visible
  const [columnsPerRow, setColumnsPerRowState] = useState(() => readStackGridColumns());
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window === 'undefined' ? 1 : window.innerWidth
  );

  // Animation state
  const isSidebarAnimating = useAnimationState(sidebarOpen);
  const isRightPanelAnimating = useAnimationState([infoSidebarOpen, isSelectionMode]);
  const isCurrentlyAnimating = isSidebarAnimating || isRightPanelAnimating;

  // Scroll preservation
  const { preserveAnchorItem, maintainScrollDuringAnimation } = useScrollPreservation();

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

  // Calculate dynamic columns and item size
  const itemSize = containerWidth / Math.max(columnsPerRow, 1);
  const totalContentHeight = Math.ceil(total / Math.max(columnsPerRow, 1)) * itemSize;
  const disableVirtualization = total <= columnsPerRow * 3;
  const updateContainerWidth = useCallback(() => {
    const container = containerRef.current;
    const nextWidth = getContainerContentWidth(container);
    if (Math.abs(containerWidth - nextWidth) < 0.5) return;

    const rect = container?.getBoundingClientRect();
    let visibleTopPx = 0;
    let visibleHeightPx = window.innerHeight;

    if (useWindowScroll) {
      if (rect) {
        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, window.innerHeight);
        visibleTopPx = Math.max(0, visibleTop - rect.top);
        visibleHeightPx = Math.max(0, visibleBottom - visibleTop) || window.innerHeight;
      }
    } else if (container) {
      visibleTopPx = Math.max(0, container.scrollTop);
      visibleHeightPx = container.clientHeight;
    }

    const currentCenterPx = visibleTopPx + visibleHeightPx / 2;
    const currentRow = Math.max(0, Math.floor(currentCenterPx / Math.max(itemSize, 1)));
    const currentColumn = Math.min(
      columnsPerRow - 1,
      Math.max(0, Math.floor(containerWidth / 2 / Math.max(itemSize, 1)))
    );
    const anchorIndex = Math.min(
      Math.max(0, total - 1),
      currentRow * columnsPerRow + currentColumn
    );

    setContainerWidth(nextWidth);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const currentContainer = containerRef.current;
        if (!currentContainer) return;

        const nextItemSize =
          getContainerContentWidth(currentContainer) / Math.max(columnsPerRow, 1);
        const nextRow = Math.max(0, Math.floor(anchorIndex / columnsPerRow));
        const nextCenterPx = nextRow * nextItemSize + nextItemSize / 2;
        const requestedVisibleTopPx = nextCenterPx - visibleHeightPx / 2;
        const maxVisibleTopPx = Math.max(0, currentContainer.scrollHeight - visibleHeightPx);
        const nextVisibleTopPx = Math.min(maxVisibleTopPx, Math.max(0, requestedVisibleTopPx));

        if (useWindowScroll) {
          if (maxVisibleTopPx <= 0) return;
          const nextRect = currentContainer.getBoundingClientRect();
          const currentVisibleTopPx = Math.max(0, -nextRect.top);
          const delta = nextVisibleTopPx - currentVisibleTopPx;
          if (Math.abs(delta) > 0.5) {
            window.scrollBy({ top: delta, behavior: 'auto' });
          }
          window.dispatchEvent(new Event('scroll'));
          return;
        }

        const maxScrollTop = Math.max(
          0,
          currentContainer.scrollHeight - currentContainer.clientHeight
        );
        if (maxScrollTop <= 0) return;
        currentContainer.scrollTop = nextVisibleTopPx;
        currentContainer.dispatchEvent(new Event('scroll'));
      });
    });
  }, [columnsPerRow, containerRef, containerWidth, itemSize, total, useWindowScroll]);

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
  });

  // Create throttled version of onLoadRange
  const throttledLoadRange = useThrottle((startIndex: number, endIndex: number) => {
    if (onLoadRange && !disableVirtualization) {
      // Load only the requested range
      onLoadRange(startIndex, endIndex);
    }
  }, SCROLL_THROTTLE_MS);

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
    if (!onLoadRange || isCurrentlyAnimating || disableVirtualization) {
      setRangeStart(0);
      setRangeEnd(Math.max(total, items.length));
      return;
    }
    // When there are zero results, avoid repeatedly issuing loadRange requests.
    // Callers should explicitly trigger initial fetch; here we suppress further requests.
    if (total === 0) {
      setRangeStart(0);
      setRangeEnd(0);
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

    setRangeStart(newStartIndex);
    setRangeEnd(newEndExclusive);

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
    containerRef.current,
    disableVirtualization,
    items.length,
    columnsPerRow,
  ]);

  // Handle animation state changes
  useEffect(() => {
    if (!disableVirtualization && isCurrentlyAnimating) {
      preserveAnchorItem(containerRef, items);
    }
    if (!disableVirtualization) {
      maintainScrollDuringAnimation(containerRef, isCurrentlyAnimating);
    }
  }, [
    isCurrentlyAnimating,
    items,
    maintainScrollDuringAnimation,
    preserveAnchorItem,
    containerRef,
    disableVirtualization,
  ]);

  useEffect(() => {
    const container = containerRef.current;

    const resizeObserver = new ResizeObserver(() => {
      updateContainerWidth();
      if (!disableVirtualization) {
        updateBounds();
      }
    });

    if (container) {
      resizeObserver.observe(container);
    }

    // スクロールリスナーは body/window へ（useWindowScroll時）
    if (!disableVirtualization) {
      if (useWindowScroll) {
        window.addEventListener('scroll', updateBounds, { passive: true });
      } else if (container) {
        container.addEventListener('scroll', updateBounds, { passive: true });
      }
    }

    // 初期計算
    updateContainerWidth();
    if (!disableVirtualization) {
      updateBounds();
    }

    const handleWindowResize = () => {
      updateContainerWidth();
      updateBounds();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      if (!disableVirtualization) {
        if (useWindowScroll) {
          window.removeEventListener('scroll', updateBounds);
        } else if (container) {
          container.removeEventListener('scroll', updateBounds);
        }
      }
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [updateBounds, updateContainerWidth, containerRef, useWindowScroll, disableVirtualization]);

  const setGridColumns = useCallback(
    (value: number) => {
      const nextColumns = clampStackGridColumns(value);
      if (nextColumns === columnsPerRow) return;

      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      let visibleTopPx = 0;
      let visibleHeightPx = window.innerHeight;

      if (useWindowScroll) {
        if (rect) {
          const visibleTop = Math.max(rect.top, 0);
          const visibleBottom = Math.min(rect.bottom, window.innerHeight);
          visibleTopPx = Math.max(0, visibleTop - rect.top);
          visibleHeightPx = Math.max(0, visibleBottom - visibleTop) || window.innerHeight;
        }
      } else if (container) {
        visibleTopPx = Math.max(0, container.scrollTop);
        visibleHeightPx = container.clientHeight;
      }

      const currentCenterPx = visibleTopPx + visibleHeightPx / 2;
      const currentRow = Math.max(0, Math.floor(currentCenterPx / Math.max(itemSize, 1)));
      const currentColumn = Math.min(
        columnsPerRow - 1,
        Math.max(0, Math.floor(containerWidth / 2 / Math.max(itemSize, 1)))
      );
      const anchorIndex = Math.min(
        Math.max(0, total - 1),
        currentRow * columnsPerRow + currentColumn
      );

      setColumnsPerRowState(nextColumns);
      writeStackGridColumns(nextColumns);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const currentContainer = containerRef.current;
          if (!currentContainer) return;

          const nextContainerWidth = getContainerContentWidth(currentContainer);
          const nextItemSize = nextContainerWidth / Math.max(nextColumns, 1);
          const nextRow = Math.max(0, Math.floor(anchorIndex / nextColumns));
          const nextCenterPx = nextRow * nextItemSize + nextItemSize / 2;
          const requestedVisibleTopPx = nextCenterPx - visibleHeightPx / 2;
          const maxVisibleTopPx = Math.max(0, currentContainer.scrollHeight - visibleHeightPx);
          const nextVisibleTopPx = Math.min(maxVisibleTopPx, Math.max(0, requestedVisibleTopPx));

          if (useWindowScroll) {
            if (maxVisibleTopPx <= 0) return;
            const nextRect = currentContainer.getBoundingClientRect();
            const currentVisibleTopPx = Math.max(0, -nextRect.top);
            const delta = nextVisibleTopPx - currentVisibleTopPx;
            if (Math.abs(delta) > 0.5) {
              window.scrollBy({ top: delta, behavior: 'auto' });
            }
          } else {
            const maxScrollTop = Math.max(
              0,
              currentContainer.scrollHeight - currentContainer.clientHeight
            );
            if (maxScrollTop <= 0) return;
            currentContainer.scrollTop = nextVisibleTopPx;
          }

          if (useWindowScroll) {
            window.dispatchEvent(new Event('scroll'));
          } else {
            currentContainer.dispatchEvent(new Event('scroll'));
          }
        });
      });
    },
    [columnsPerRow, containerRef, containerWidth, itemSize, total, useWindowScroll]
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
      const pages = queryClient.getQueriesData<any>({ queryKey: ['stacks', 'page'] });
      for (const [key, data] of pages) {
        if (!data || !Array.isArray(data.stacks)) continue;
        const idx = data.stacks.findIndex((s: any) => s?.id === id);
        if (idx >= 0) {
          const updated = { ...data.stacks[idx] };
          updated.favorited = nextFavorited;
          updated.isFavorite = nextFavorited;
          const newData = {
            ...data,
            stacks: [...data.stacks.slice(0, idx), updated, ...data.stacks.slice(idx + 1)],
          };
          queryClient.setQueryData(key, newData);
        }
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

        if (updates.setMediaType) {
          await apiClient.bulkSetMediaType(stackIds, updates.setMediaType);
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
