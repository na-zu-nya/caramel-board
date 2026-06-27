import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MediaCategory, Stack, StackFilter } from '@/types';

function isMediaCategory(value: string | undefined): value is MediaCategory {
  return value === 'image' || value === 'comic' || value === 'video';
}

interface UseAdjacentStacksOptions {
  datasetId: string;
  mediaType?: string;
  currentStackId: string;
}

interface AdjacentStacks {
  previousStack: Stack | null;
  nextStack: Stack | null;
  currentIndex: number;
  totalStacks: number;
}

export function useAdjacentStacks({
  datasetId,
  mediaType,
  currentStackId,
}: UseAdjacentStacksOptions) {
  // Fetch stacks from the current dataset/media type
  const { data: stacksData } = useQuery({
    queryKey: ['stacks', 'paginated', { datasetId, mediaType, limit: 1000 }],
    queryFn: async ({ signal }) => {
      const filter: StackFilter = { datasetId };
      if (isMediaCategory(mediaType)) {
        filter.mediaCategory = mediaType;
      }

      return await apiClient.getStacks(
        {
          datasetId,
          filter,
          limit: 1000,
          offset: 0,
        },
        { signal }
      );
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Calculate adjacent stacks
  const adjacentStacks: AdjacentStacks = {
    previousStack: null,
    nextStack: null,
    currentIndex: -1,
    totalStacks: 0,
  };

  if (stacksData?.stacks) {
    const currentIndex = stacksData.stacks.findIndex((s: any) => s.id === currentStackId);

    if (currentIndex !== -1) {
      adjacentStacks.currentIndex = currentIndex;
      adjacentStacks.totalStacks = stacksData.stacks.length;

      if (currentIndex > 0) {
        adjacentStacks.previousStack = stacksData.stacks[currentIndex - 1];
      }

      if (currentIndex < stacksData.stacks.length - 1) {
        adjacentStacks.nextStack = stacksData.stacks[currentIndex + 1];
      }
    }
  }

  return adjacentStacks;
}
