import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { infoSidebarOpenAtom, selectedItemIdAtom } from '@/stores/ui';
import type { Stack } from '@/types';

interface UseStackViewerOptions {
  datasetId: string;
  mediaType: string;
  stackId: string;
}

interface UseStackViewerReturn {
  stack: Stack | undefined;
  isLoading: boolean;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  isListMode: boolean;
  setIsListMode: (mode: boolean | ((prev: boolean) => boolean)) => void;
  handleFavoriteToggle: () => Promise<void>;
  handleLikeToggle: () => Promise<void>;
  refetch: () => void;
}

export function useStackViewer({
  datasetId,
  stackId,
}: UseStackViewerOptions): UseStackViewerReturn {
  const searchParams = useSearch({ strict: false }) as { page?: number };
  const [currentPage, setCurrentPage] = useState(Number(searchParams.page) || 0);
  const [isListMode, setIsListMode] = useState(false);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);
  const setIsInfoSidebarOpen = useSetAtom(infoSidebarOpenAtom);
  const location = useLocation();
  const previousLocationRef = useRef(location);

  // Fetch stack data
  const {
    data: stack,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['stack', datasetId, stackId],
    queryFn: () => apiClient.getStack(stackId, datasetId),
  });

  // Set selected item ID when stack loads
  useEffect(() => {
    if (stack) {
      setSelectedItemId(Number(stack.id));
    }
  }, [stack, setSelectedItemId]);

  // Cleanup only when leaving the StackViewer route entirely (not when switching stacks)
  useEffect(() => {
    const currentPath = location.pathname;
    const previousPath = previousLocationRef.current.pathname;

    const wasInViewer = previousPath.includes('/stacks/');
    const isInViewer = currentPath.includes('/stacks/');

    // Only when transitioning from any "/stacks/" path to a non-stacks path
    if (wasInViewer && !isInViewer) {
      console.log('[StackViewer] Leaving viewer route → cleanup');
      setSelectedItemId(null);
      setIsInfoSidebarOpen(false);
    }

    // Update the previous location ref
    previousLocationRef.current = location;
  }, [location, setSelectedItemId, setIsInfoSidebarOpen]);

  // When stackId or search param page changes within the same route, reset current page accordingly
  useEffect(() => {
    const nextPage = Number(searchParams.page) || 0;
    setCurrentPage(nextPage);
  }, [searchParams.page]);

  // Clamp current page after stack data loads to avoid out-of-range pages
  useEffect(() => {
    if (!stack) return;
    if (currentPage < 0 || currentPage > (stack.assets?.length || 1) - 1) {
      setCurrentPage(0);
    }
  }, [stack, currentPage]);

  // Favorite toggle
  const handleFavoriteToggle = useCallback(async () => {
    if (!stack) return;
    try {
      await apiClient.toggleStackFavorite(stack.id, !stack.favorited);
      refetch();
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  }, [stack, refetch]);

  // Like toggle
  const handleLikeToggle = useCallback(async () => {
    if (!stack) return;
    try {
      await apiClient.likeStack(stack.id);
      refetch();
    } catch (error) {
      console.error('Failed to like stack:', error);
    }
  }, [stack, refetch]);

  return {
    stack,
    isLoading,
    currentPage,
    setCurrentPage,
    isListMode,
    setIsListMode,
    handleFavoriteToggle,
    handleLikeToggle,
    refetch,
  };
}
