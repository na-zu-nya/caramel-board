import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { CreateCollectionModal } from '@/components/modals/CreateCollectionModal';
import { apiClient } from '@/lib/api-client';
import type { Collection } from '@/types';

type StackCollectionMenuStackId = string | number;

function toNumericStackIds(stackIds: readonly StackCollectionMenuStackId[]): number[] {
  const numericIds: number[] = [];
  const seen = new Set<number>();

  for (const stackId of stackIds) {
    const numericId = typeof stackId === 'number' ? stackId : Number.parseInt(String(stackId), 10);
    if (!Number.isInteger(numericId) || numericId <= 0 || seen.has(numericId)) continue;
    seen.add(numericId);
    numericIds.push(numericId);
  }

  return numericIds;
}

function toDatasetNumber(datasetId: string | number): number | null {
  const numericId =
    typeof datasetId === 'number' ? datasetId : Number.parseInt(String(datasetId), 10);
  return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
}

export function useStackCollectionMenu(datasetId: string | number) {
  const queryClient = useQueryClient();
  const datasetNumber = toDatasetNumber(datasetId);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pendingStackIds, setPendingStackIds] = useState<number[]>([]);

  const collectionsQuery = useQuery({
    queryKey: ['stack-context-collections', String(datasetId), 'manual'],
    queryFn: async () => {
      if (datasetNumber === null) return [];
      const response = await apiClient.getCollections({
        dataSetId: datasetNumber,
        type: 'MANUAL',
        limit: 1000,
      });
      return response.collections;
    },
    enabled: datasetNumber !== null,
    staleTime: 60_000,
  });

  const invalidateCollectionState = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({
        queryKey: ['stack-context-collections', String(datasetId), 'manual'],
      }),
      queryClient.invalidateQueries({ queryKey: ['collection-folders'] }),
      queryClient.invalidateQueries({ queryKey: ['collection-folders', String(datasetId)] }),
      queryClient.invalidateQueries({ queryKey: ['collection'] }),
      queryClient.invalidateQueries({ queryKey: ['stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['library-counts', String(datasetId)] }),
      queryClient.invalidateQueries({ queryKey: ['dataset-overview', String(datasetId)] }),
    ]);
  }, [datasetId, queryClient]);

  const addStackIdsToCollection = useCallback(
    async (collectionId: string | number, stackIds: readonly StackCollectionMenuStackId[]) => {
      const numericStackIds = toNumericStackIds(stackIds);
      if (numericStackIds.length === 0) return;

      if (numericStackIds.length === 1) {
        await apiClient.addStackToCollection(collectionId, numericStackIds[0]);
      } else {
        await apiClient.bulkAddStacksToCollection(collectionId, numericStackIds);
      }

      await invalidateCollectionState();
    },
    [invalidateCollectionState]
  );

  const openCreateCollectionForStackIds = useCallback(
    (stackIds: readonly StackCollectionMenuStackId[]) => {
      const numericStackIds = toNumericStackIds(stackIds);
      if (numericStackIds.length === 0) return;
      setPendingStackIds(numericStackIds);
      setCreateModalOpen(true);
    },
    []
  );

  const handleCollectionCreated = useCallback(
    async (collection: Collection) => {
      if (pendingStackIds.length > 0) {
        await addStackIdsToCollection(collection.id, pendingStackIds);
        return;
      }

      await invalidateCollectionState();
    },
    [addStackIdsToCollection, invalidateCollectionState, pendingStackIds]
  );

  const handleCreateModalOpenChange = useCallback((open: boolean) => {
    setCreateModalOpen(open);
    if (!open) {
      setPendingStackIds([]);
    }
  }, []);

  const createCollectionModal = useMemo(
    () =>
      createModalOpen ? (
        <CreateCollectionModal
          open={createModalOpen}
          onOpenChange={handleCreateModalOpenChange}
          onSuccess={handleCollectionCreated}
          type="MANUAL"
          lockType
        />
      ) : null,
    [createModalOpen, handleCollectionCreated, handleCreateModalOpenChange]
  );

  return {
    collections: collectionsQuery.data ?? [],
    isLoadingCollections: collectionsQuery.isLoading,
    addStackIdsToCollection,
    openCreateCollectionForStackIds,
    createCollectionModal,
  };
}
