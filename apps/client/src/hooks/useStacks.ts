import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { SortOption, StackFilter } from '@/types';

// Query keys
export const stackKeys = {
  all: ['stacks'] as const,
  lists: () => [...stackKeys.all, 'list'] as const,
  list: (filter: StackFilter, sort?: SortOption) => [...stackKeys.lists(), filter, sort] as const,
  details: () => [...stackKeys.all, 'detail'] as const,
  detail: (datasetId: string, stackId: string) =>
    [...stackKeys.details(), datasetId, stackId] as const,
};

// Hooks
export function useStacks(params: {
  datasetId: string | number;
  filter?: StackFilter;
  sort?: SortOption;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: stackKeys.list(params.filter || {}, params.sort),
    queryFn: () => apiClient.getStacks(params),
    enabled: params.enabled !== false,
  });
}

export function useStack(datasetId: string, stackId: string) {
  return useQuery({
    queryKey: stackKeys.detail(datasetId, stackId),
    queryFn: () => apiClient.getStack(stackId, datasetId),
    enabled: !!datasetId && !!stackId,
  });
}

// Hook for infinite scrolling with mediaType filter
export function useStacksInfinite(params: {
  datasetId: string | number;
  filter?: StackFilter;
  sort?: SortOption;
  limit?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: stackKeys.list(params.filter || {}, params.sort),
    queryFn: () =>
      apiClient.getStacks({
        ...params,
        offset: 0,
      }),
    enabled: params.enabled !== false,
  });
}
