import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import type { Collection } from '@/types';

// 内部ユーティリティ: コレクションがScratchかどうか
export function isScratchCollection(c?: Partial<Collection> | null): boolean {
  if (!c) return false;
  // 優先: type === 'SCRATCH' > kind フィールド > filterConfig.kind > name === 'Scratch'
  const type = (c as any).type;
  if (type === 'SCRATCH') return true;
  const k = (c as any).kind || (c.filterConfig as any)?.kind;
  return (
    k === 'scratch' ||
    String(c.name || '')
      .trim()
      .toLowerCase() === 'scratch'
  );
}

// Scratch コレクションの取得/作成
export async function getOrCreateScratch(dataSetId: string | number): Promise<Collection> {
  // 既存コレクションから検索
  const resp = await apiClient.getCollections({ dataSetId: Number(dataSetId), limit: 1000 });
  const found = resp.collections.find((c) => isScratchCollection(c));
  if (found) return found;
  // 新規作成は SCRATCH タイプで統一（フォールバックなし）
  return apiClient.createCollection({
    name: 'Scratch',
    icon: 'notebook-text',
    description: 'Temporary workspace',
    type: 'SCRATCH' as any,
    dataSetId: Number(dataSetId),
  });
}

// すべてのスタックIDを取得
async function listStackIdsInCollection(collectionId: number): Promise<number[]> {
  const items = await apiClient.getCollectionStacks(collectionId);
  return items.map((item) => Number(item.stack.id));
}

// Scratch 操作用の Hook 群
export function useScratch(datasetId: string | number) {
  const queryClient = useQueryClient();

  const scratchQuery = useQuery({
    queryKey: ['scratch-collection', datasetId],
    queryFn: () => getOrCreateScratch(datasetId),
  });

  const clearMutation = useMutation({
    mutationFn: async (collectionId: number) => {
      const ids = await listStackIdsInCollection(collectionId);
      // 1つずつ削除（APIにbulkがないため）
      for (const id of ids) {
        await apiClient.removeStackFromCollection(collectionId, id);
      }
      return ids.length;
    },
    onSuccess: async (_removedCount) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stacks'] }),
        queryClient.invalidateQueries({ queryKey: ['collection'] }),
        queryClient.invalidateQueries({ queryKey: ['collection-folders'] }),
        queryClient.invalidateQueries({ queryKey: ['library-counts', String(datasetId)] }),
      ]);
    },
  });

  const convertMutation = useMutation<
    { newCol: Collection; moved: number },
    Error,
    { collectionId: number; dataSetId: string | number; name: string }
  >({
    mutationFn: async ({ collectionId, dataSetId, name }) => {
      const ids = await listStackIdsInCollection(collectionId);
      // 新しいコレクションを作成
      const newCol = await apiClient.createCollection({
        name,
        icon: 'BookText',
        type: 'MANUAL',
        dataSetId: Number(dataSetId),
      });
      if (ids.length > 0) {
        await apiClient.bulkAddStacksToCollection(newCol.id, ids);
      }
      // Scratch を空にする
      for (const id of ids) {
        await apiClient.removeStackFromCollection(collectionId, id);
      }
      return { newCol, moved: ids.length };
    },
    onSuccess: async (_result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stacks'] }),
        queryClient.invalidateQueries({ queryKey: ['collection'] }),
        queryClient.invalidateQueries({ queryKey: ['collection-folders'] }),
        queryClient.invalidateQueries({ queryKey: ['library-counts', String(datasetId)] }),
      ]);
    },
  });

  const ensureScratch = useCallback(async () => {
    const col = await getOrCreateScratch(datasetId);
    await queryClient.invalidateQueries({ queryKey: ['collection-folders', String(datasetId)] });
    return col;
  }, [datasetId, queryClient]);

  return {
    scratch: scratchQuery.data,
    isLoading: scratchQuery.isLoading,
    refetch: scratchQuery.refetch,
    ensureScratch,
    clearScratch: clearMutation.mutateAsync,
    isClearing: clearMutation.isPending,
    convertScratch: convertMutation.mutateAsync,
    isConverting: convertMutation.isPending,
  };
}
