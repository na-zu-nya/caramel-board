import type { MediaGridItem } from '@/types';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

interface UseStackNavigationProps {
  currentStackId: string | number;
  stacks?: MediaGridItem[];
  currentPage?: number;
  singleStack?: boolean;
  createLink?: (stackId: string) => string;
}

export function useStackNavigation({
  currentStackId,
  stacks = [],
  currentPage = 0,
  singleStack = false,
  createLink,
}: UseStackNavigationProps) {
  const navigate = useNavigate();
  const router = useRouter();

  // Create reverse list and index map for efficient lookup
  const { reversedStacks, stackIndexMap } = useMemo(() => {
    const reversed = [...stacks].reverse();
    const indexMap = new Map<string | number, number>();
    reversed.forEach((stack, index) => {
      indexMap.set(stack.id, index);
    });
    return { reversedStacks: reversed, stackIndexMap: indexMap };
  }, [stacks]);

  // Get current stack index
  const currentStackIndex = useMemo(() => {
    if (singleStack || !currentStackId) return -1;
    return stackIndexMap.get(currentStackId) ?? -1;
  }, [singleStack, currentStackId, stackIndexMap]);

  // Get sibling stacks
  const getSiblingStack = useCallback(
    (offset: number) => {
      if (singleStack || currentStackIndex === -1) return undefined;
      return reversedStacks[currentStackIndex + offset];
    },
    [singleStack, currentStackIndex, reversedStacks]
  );

  const nextStack = useMemo(() => getSiblingStack(1), [getSiblingStack]);
  const prevStack = useMemo(() => getSiblingStack(-1), [getSiblingStack]);

  // Navigate to a specific stack
  const navigateToStack = useCallback(
    (stackId: string | number, page = 0) => {
      if (createLink) {
        const link = createLink(String(stackId));
        navigate({ to: link, search: { page } });
      }
    },
    [createLink, navigate]
  );

  // Navigate to the next asset or stack
  const navigateNext = useCallback(
    (currentAssetCount: number) => {
      if (!singleStack && currentPage + 1 > currentAssetCount - 1 && nextStack) {
        // Move to next stack
        navigateToStack(nextStack.id, 0);
        return true;
      }
      return false;
    },
    [singleStack, currentPage, nextStack, navigateToStack]
  );

  // Navigate to the previous asset or stack
  const navigatePrev = useCallback(() => {
    if (!singleStack && currentPage - 1 < 0 && prevStack) {
      // Move to previous stack's last asset
      // Note: We'd need to know the asset count of the previous stack
      // For now, just go to the first page
      navigateToStack(prevStack.id, 0);
      return true;
    }
    return false;
  }, [singleStack, currentPage, prevStack, navigateToStack]);

  // Navigate back to the list
  const navigateBack = useCallback(() => {
    const state = router.state;
    const previousLocation = state.location;
    const searchParams = new URLSearchParams(previousLocation.search);

    // Check if we came from a collection
    const fromCollection = searchParams.get('from') === 'collection';
    const collectionId = searchParams.get('collectionId');

    // Try to use browser back if we have history
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // Otherwise navigate to the appropriate list page
      const currentPath = previousLocation.pathname;

      if (fromCollection && collectionId) {
        // Navigate back to collection page
        const match = currentPath.match(/\/library\/(\d+)\//);
        if (match) {
          const [, datasetId] = match;
          navigate({
            to: '/library/$datasetId/collections/$collectionId',
            params: { datasetId, collectionId },
          });
        }
      } else if (currentPath.includes('/media-type/')) {
        // Navigate back to media type page
        const match = currentPath.match(/\/library\/(\d+)\/media-type\/(\w+)/);
        if (match) {
          const [, datasetId, mediaType] = match;
          navigate({ to: `/library/${datasetId}/media-type/${mediaType}` });
        }
      }
    }
  }, [navigate, router]);

  // Shuffle navigation
  const navigateShuffle = useCallback(() => {
    if (reversedStacks.length === 0) return;
    const randomIndex = Math.floor(Math.random() * reversedStacks.length);
    const randomStack = reversedStacks[randomIndex];
    navigateToStack(randomStack.id, 0);
  }, [reversedStacks, navigateToStack]);

  return {
    currentStackIndex,
    nextStack,
    prevStack,
    navigateToStack,
    navigateNext,
    navigatePrev,
    navigateBack,
    navigateShuffle,
  };
}
