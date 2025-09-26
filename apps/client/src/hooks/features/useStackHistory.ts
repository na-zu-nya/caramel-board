import { useNavigate, useParams } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';

interface UseStackHistoryOptions {
  stackId: string;
  currentPage: number;
  enabled?: boolean;
}

export function useStackHistory({
  stackId: _stackId,
  currentPage,
  enabled = true,
}: UseStackHistoryOptions) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });

  // Update URL without reload when stack or page changes
  const updateUrl = useCallback(
    (newStackId: string, newPage: number) => {
      if (!enabled) return;

      const currentPath = window.location.pathname;
      const pathParts = currentPath.split('/');

      // Find and update stack ID in path
      const stackIndex = pathParts.findIndex((part) => part === 'stacks');
      if (stackIndex !== -1 && stackIndex + 1 < pathParts.length) {
        pathParts[stackIndex + 1] = newStackId;
      }

      const newPath = pathParts.join('/');
      const newParams = new URLSearchParams();

      if (newPage > 0) {
        newParams.set('page', String(newPage));
      }

      const newUrl = newParams.toString() ? `${newPath}?${newParams}` : newPath;

      // Use replaceState to avoid adding to history
      window.history.replaceState({}, '', newUrl);
    },
    [enabled]
  );

  // Update URL when current page changes
  useEffect(() => {
    if (!enabled) return;

    const params = new URLSearchParams(window.location.search);

    if (currentPage > 0) {
      params.set('page', String(currentPage));
    } else {
      params.delete('page');
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params}`
      : window.location.pathname;

    window.history.replaceState({}, '', newUrl);
  }, [currentPage, enabled]);

  // Navigate to a different stack without reload
  const navigateToStack = useCallback(
    (newStackId: string, newPage = 0) => {
      if (!enabled) return;

      updateUrl(newStackId, newPage);

      // Trigger a soft navigation by updating route params
      // This will cause the parent component to re-render with new stackId
      navigate({
        to: '.',
        params: { ...params, stackId: newStackId },
        search: { page: newPage > 0 ? newPage : undefined },
        replace: true,
      });
    },
    [enabled, updateUrl, navigate, params]
  );

  return {
    updateUrl,
    navigateToStack,
  };
}
