import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';

export function useDatasetOverview(datasetId: string) {
  return useQuery({
    queryKey: ['dataset-overview', datasetId],
    queryFn: () => apiClient.getDatasetOverview(datasetId),
    staleTime: 60000, // 1 minute
  });
}
