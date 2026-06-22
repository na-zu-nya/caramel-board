import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearch } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { infoSidebarOpenAtom, selectedInfoAssetIdAtom, selectedItemIdAtom } from '@/stores/ui';
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
  handleAssetFavoriteToggle: () => Promise<void>;
  handleLikeToggle: () => Promise<void>;
  refetch: () => void;
}

type CurrentPageState = {
  stackId: string;
  routePage: number;
  page: number;
};

type SetCurrentPageValue = number | ((prev: number) => number);

export function useStackViewer({
  datasetId,
  stackId,
}: UseStackViewerOptions): UseStackViewerReturn {
  const searchParams = useSearch({ strict: false }) as { page?: number };
  const routePage = Number(searchParams.page) || 0;
  const [currentPageState, setCurrentPageState] = useState<CurrentPageState>(() => ({
    stackId,
    routePage,
    page: routePage,
  }));
  const currentPage =
    currentPageState.stackId === stackId && currentPageState.routePage === routePage
      ? currentPageState.page
      : routePage;
  const setCurrentPage = useCallback(
    (value: SetCurrentPageValue) => {
      setCurrentPageState((prev) => {
        const basePage =
          prev.stackId === stackId && prev.routePage === routePage ? prev.page : routePage;
        const nextPage = typeof value === 'function' ? value(basePage) : value;
        return { stackId, routePage, page: nextPage };
      });
    },
    [routePage, stackId]
  );
  const [isListMode, setIsListMode] = useState(false);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);
  const setSelectedInfoAssetId = useSetAtom(selectedInfoAssetIdAtom);
  const setIsInfoSidebarOpen = useSetAtom(infoSidebarOpenAtom);
  const queryClient = useQueryClient();
  const location = useLocation();
  const previousLocationRef = useRef(location);

  useEffect(() => {
    return () => setSelectedInfoAssetId(null);
  }, [setSelectedInfoAssetId]);

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
      startTransition(() => {
        setSelectedItemId(Number(stack.id));
      });
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
      setSelectedInfoAssetId(null);
      setIsInfoSidebarOpen(false);
    }

    // Update the previous location ref
    previousLocationRef.current = location;
  }, [location, setSelectedInfoAssetId, setSelectedItemId, setIsInfoSidebarOpen]);

  // When stackId or search param page changes within the same route, reset current page accordingly
  useEffect(() => {
    setCurrentPageState((prev) => {
      if (prev.stackId === stackId && prev.routePage === routePage) return prev;
      return { stackId, routePage, page: routePage };
    });
  }, [routePage, stackId]);

  // Clamp current page after stack data loads to avoid out-of-range pages
  useEffect(() => {
    if (!stack) return;
    if (currentPage < 0 || currentPage > (stack.assets?.length || 1) - 1) {
      setCurrentPage(0);
    }
  }, [stack, currentPage, setCurrentPage]);

  useEffect(() => {
    const selectedAssetId = stack?.assets?.[currentPage]?.id ?? null;
    startTransition(() => {
      setSelectedInfoAssetId(selectedAssetId);
    });
  }, [currentPage, setSelectedInfoAssetId, stack?.assets]);

  // Stack favorite toggle
  const handleFavoriteToggle = useCallback(async () => {
    if (!stack) return;
    try {
      await apiClient.toggleStackFavorite(stack.id, !stack.favorited);
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['favorite-items', datasetId] });
    } catch (error) {
      console.error('Failed to toggle stack favorite:', error);
    }
  }, [datasetId, queryClient, stack, refetch]);

  // Page favorite toggle
  const handleAssetFavoriteToggle = useCallback(async () => {
    if (!stack) return;
    const asset = stack.assets?.[currentPage];
    if (!asset) return;
    try {
      const currentFavorited = Boolean(asset.favorited ?? asset.isFavorite);
      await apiClient.toggleAssetFavorite(asset.id, !currentFavorited);
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['favorite-items', datasetId] });
    } catch (error) {
      console.error('Failed to toggle page favorite:', error);
    }
  }, [currentPage, datasetId, queryClient, stack, refetch]);

  // Like toggle
  const handleLikeToggle = useCallback(async () => {
    if (!stack) return;
    const asset = stack.assets?.[currentPage];
    try {
      if (asset) {
        await apiClient.likeAsset(asset.id);
      } else {
        await apiClient.likeStack(stack.id);
      }
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['likes', 'yearly'] });
    } catch (error) {
      console.error('Failed to like stack:', error);
    }
  }, [currentPage, queryClient, stack, refetch]);

  return {
    stack,
    isLoading,
    currentPage,
    setCurrentPage,
    isListMode,
    setIsListMode,
    handleFavoriteToggle,
    handleAssetFavoriteToggle,
    handleLikeToggle,
    refetch,
  };
}
