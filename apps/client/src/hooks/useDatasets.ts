import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Dataset } from '@/types';

// Query keys
export const datasetKeys = {
  all: ['datasets'] as const,
  detail: (id: string) => ['datasets', id] as const,
};

// Hooks
export function useDatasets() {
  return useQuery({
    queryKey: datasetKeys.all,
    queryFn: () => apiClient.getDatasets(),
  });
}

export function useDataset(id: string) {
  return useQuery({
    queryKey: datasetKeys.detail(id),
    queryFn: () => apiClient.getDataset(id),
    enabled: !!id,
  });
}

export function useCreateDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      icon?: string;
      themeColor?: string;
      description?: string;
    }) => apiClient.createDataset(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
    },
  });
}

export function useUpdateDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      icon?: string;
      themeColor?: string;
      description?: string;
    }) => apiClient.updateDataset(id, data),
    onMutate: async ({ id, ...updates }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: datasetKeys.all }),
        queryClient.cancelQueries({ queryKey: datasetKeys.detail(id) }),
      ]);

      const previousAll = queryClient.getQueryData(datasetKeys.all);
      const previousDetail = queryClient.getQueryData(datasetKeys.detail(id));

      if (
        'name' in updates ||
        'icon' in updates ||
        'themeColor' in updates ||
        'description' in updates
      ) {
        queryClient.setQueryData(datasetKeys.all, (old: Dataset[] | undefined) => {
          if (!old) return old;
          return old.map((item) =>
            String(item.id) === String(id) ? ({ ...item, ...updates } as Dataset) : item
          );
        });

        queryClient.setQueryData(datasetKeys.detail(id), (old: Dataset | undefined) =>
          old ? ({ ...old, ...updates } as Dataset) : old
        );
      }

      return { previousAll, previousDetail, id };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      if (context.previousAll) {
        queryClient.setQueryData(datasetKeys.all, context.previousAll);
      }
      if (context.previousDetail) {
        queryClient.setQueryData(datasetKeys.detail(context.id), context.previousDetail);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
      queryClient.invalidateQueries({ queryKey: datasetKeys.detail(variables.id) });
    },
  });
}

export function useDeleteDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deleteDataset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
    },
  });
}
