import { useCallback } from 'react';
import { useAdjacentStacks } from './useAdjacentStacks';
import { useStackHistory } from './useStackHistory';

interface UseStackSwipeNavigationOptions {
  datasetId: string;
  mediaType?: string;
  currentStackId: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function useStackSwipeNavigation({
  datasetId,
  mediaType,
  currentStackId,
  currentPage,
  totalPages,
  onPageChange,
}: UseStackSwipeNavigationOptions) {
  const { navigateToStack } = useStackHistory({
    stackId: currentStackId,
    currentPage,
  });

  const { previousStack, nextStack } = useAdjacentStacks({
    datasetId,
    mediaType,
    currentStackId,
  });

  const handleSwipeLeft = useCallback(() => {
    if (currentPage < totalPages - 1) {
      // Move to next asset in current stack
      onPageChange(currentPage + 1);
    } else if (nextStack) {
      // Move to first asset of next stack
      navigateToStack(String(nextStack.id), 0);
    }
  }, [currentPage, totalPages, nextStack, onPageChange, navigateToStack]);

  const handleSwipeRight = useCallback(() => {
    if (currentPage > 0) {
      // Move to previous asset in current stack
      onPageChange(currentPage - 1);
    } else if (previousStack) {
      // Move to last asset of previous stack
      const lastAssetIndex = Math.max(0, (previousStack.assets?.length || 1) - 1);
      navigateToStack(String(previousStack.id), lastAssetIndex);
    }
  }, [currentPage, previousStack, onPageChange, navigateToStack]);

  return {
    handleSwipeLeft,
    handleSwipeRight,
    canSwipeLeft: currentPage < totalPages - 1 || !!nextStack,
    canSwipeRight: currentPage > 0 || !!previousStack,
    previousStack,
    nextStack,
  };
}
