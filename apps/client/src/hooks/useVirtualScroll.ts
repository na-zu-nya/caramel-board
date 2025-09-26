import { useCallback, useState } from 'react';

interface VirtualScrollOptions {
  itemSize: number;
  columnsPerRow: number;
  total: number;
  bufferSize?: number;
}

export function useVirtualScroll(options: VirtualScrollOptions) {
  const { itemSize, columnsPerRow, total, bufferSize = 5 } = options;
  const [scrollTop, setScrollTop] = useState(0);

  const getVisibleRange = useCallback(() => {
    const headerOffset = 56; // 3.5rem header offset
    const visibleTop = Math.max(0, scrollTop - headerOffset);
    const visibleBottom = visibleTop + window.innerHeight;

    const totalRows = Math.ceil(total / columnsPerRow);

    const firstVisibleRow = Math.floor(visibleTop / itemSize);
    const lastVisibleRow = Math.ceil(visibleBottom / itemSize);

    // Add buffer
    const firstRow = Math.max(0, firstVisibleRow - bufferSize);
    const lastRow = Math.min(totalRows - 1, lastVisibleRow + bufferSize);

    const firstIndex = firstRow * columnsPerRow;
    const lastIndex = (lastRow + 1) * columnsPerRow - 1;

    return { firstIndex, lastIndex, firstRow, lastRow, totalRows };
  }, [scrollTop, itemSize, columnsPerRow, total, bufferSize]);

  const getVisibleItems = useCallback(
    (items: any[]) => {
      const { firstIndex, lastIndex, firstRow } = getVisibleRange();

      // Only render items that are both visible and loaded
      const availableStartIndex = Math.max(0, firstIndex);
      const availableEndIndex = Math.min(lastIndex + 1, items.length);
      const visibleItems = items.slice(availableStartIndex, availableEndIndex);

      return { visibleItems, firstRow };
    },
    [getVisibleRange]
  );

  const getSpacerHeights = useCallback(() => {
    const { firstRow, totalRows } = getVisibleRange();
    const { lastRow } = getVisibleRange();

    const topSpacerHeight = firstRow * itemSize;
    console.log('topSpacerHeight', topSpacerHeight, itemSize);
    const totalRemainingRows = Math.max(0, totalRows - (lastRow + 1));
    const bottomSpacerHeight = totalRemainingRows * itemSize;

    return { topSpacerHeight, bottomSpacerHeight };
  }, [getVisibleRange, itemSize]);

  const getTotalContentHeight = useCallback(() => {
    const totalRows = Math.ceil(total / columnsPerRow);
    return totalRows * itemSize;
  }, [total, columnsPerRow, itemSize]);

  return {
    scrollTop,
    setScrollTop,
    getVisibleRange,
    getVisibleItems,
    getSpacerHeights,
    getTotalContentHeight,
  };
}
