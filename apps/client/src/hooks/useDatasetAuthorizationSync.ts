import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  type DatasetProtectionStatus,
  subscribeDatasetAuthorizationRequired,
} from '@/lib/dataset-authorization';

function markDatasetAsUnauthorized(queryClient: QueryClient, datasetId: string) {
  queryClient.setQueryData<DatasetProtectionStatus>(['dataset-protection', datasetId], {
    isProtected: true,
    authorized: false,
  });
}

export function useDatasetAuthorizationSync() {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      subscribeDatasetAuthorizationRequired((datasetId) => {
        markDatasetAsUnauthorized(queryClient, datasetId);
      }),
    [queryClient]
  );
}
