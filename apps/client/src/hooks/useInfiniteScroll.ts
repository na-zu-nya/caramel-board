import { useCallback, useRef } from 'react';

interface InfiniteScrollOptions {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore?: () => void;
  shouldSuppressScroll: boolean;
  itemSize: number;
  columnsPerRow: number;
}

export function useInfiniteScroll(options: InfiniteScrollOptions) {
  const { hasMore, isLoading, onLoadMore, shouldSuppressScroll, itemSize, columnsPerRow } = options;
  const scrollEndTimeoutRef = useRef<number | null>(null);

  // Check if more data should be loaded - optimized for scroll-stop loading
  const checkLoadMore = useCallback(
    (containerRef: React.RefObject<HTMLDivElement>, itemsLength: number) => {
      const container = containerRef.current;
      if (!container || !hasMore || !onLoadMore || isLoading || shouldSuppressScroll) return;

      const scrollTop = container.scrollTop;
      const clientHeight = container.clientHeight;
      const headerOffset = 56;

      // Calculate current visible area
      const visibleTop = scrollTop - headerOffset;
      const visibleBottom = visibleTop + clientHeight;

      // Calculate how many items we need for current view + buffer
      const visibleRowStart = Math.floor(visibleTop / itemSize);
      const visibleRowEnd = Math.ceil(visibleBottom / itemSize);
      const bufferRows = 10; // Aggressive buffer for smooth scrolling

      const neededRowEnd = visibleRowEnd + bufferRows;
      const neededItemCount = neededRowEnd * columnsPerRow;

      // Load more if we don't have enough items for current position + buffer
      if (neededItemCount > itemsLength) {
        console.log('🚀 Loading more items for current position', {
          currentItems: itemsLength,
          neededItems: neededItemCount,
          visibleRowStart,
          visibleRowEnd,
          scrollTop: Math.round(scrollTop),
        });
        onLoadMore();
      }
    },
    [hasMore, onLoadMore, isLoading, shouldSuppressScroll, itemSize, columnsPerRow]
  );

  // Handle scroll on the container itself
  const handleScroll = useCallback(
    (
      containerRef: React.RefObject<HTMLDivElement>,
      itemsLength: number,
      setScrollTop: (scrollTop: number) => void
    ) => {
      const container = containerRef.current;
      if (!container) return;

      // Update scroll position immediately for smooth rendering
      const scrollTop = container.scrollTop;
      console.log('setScrollTop', scrollTop);
      setScrollTop(scrollTop);

      // Clear previous scroll end timeout
      if (scrollEndTimeoutRef.current) {
        clearTimeout(scrollEndTimeoutRef.current);
      }

      // Only check for load more when scrolling stops AND no animations are running
      scrollEndTimeoutRef.current = window.setTimeout(() => {
        if (!shouldSuppressScroll) {
          console.log('📍 Scroll stopped, checking for load more...');
          checkLoadMore(containerRef, itemsLength);
        }
      }, 500); // Increased delay to prevent aggressive loading
    },
    [checkLoadMore, shouldSuppressScroll]
  );

  // Cleanup function for timeouts
  const cleanup = useCallback(() => {
    if (scrollEndTimeoutRef.current) {
      clearTimeout(scrollEndTimeoutRef.current);
    }
  }, []);

  return {
    handleScroll,
    checkLoadMore,
    cleanup,
  };
}
