import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { useDrag } from '@/contexts/DragContext';
import { useScratch } from '@/hooks/useScratch';
import { apiClient } from '@/lib/api-client';
import { removeStackFromCache } from '@/lib/stack-cache';
import {
  setExternalImageDragData,
  setNativeImageDragPreview,
  setStackDragData,
} from '@/lib/stack-drag-data';
import { infoSidebarOpenAtom, selectedItemIdAtom } from '@/stores/ui';

export function useStackTile(datasetId: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setDragKind, setIsDragging } = useDrag();
  const { ensureScratch } = useScratch(datasetId);
  const setInfoOpen = useSetAtom(infoSidebarOpenAtom);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);
  const selectedInfoId = useAtomValue(selectedItemIdAtom);

  const invalidateAfterRemoval = useCallback(() => {
    void Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['stack'] }),
      queryClient.invalidateQueries({ queryKey: ['stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['tag-stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['autotag-stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
      queryClient.invalidateQueries({ queryKey: ['tags', datasetId] }),
      queryClient.invalidateQueries({ queryKey: ['likes', 'yearly'] }),
      queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] }),
    ]);
  }, [datasetId, queryClient]);

  const onOpen = useCallback(
    async (
      stackId: number | string,
      options?: { page?: number; mediaType?: string; listToken?: string }
    ) => {
      const search = {
        ...(typeof options?.page === 'number' && options.page > 0 ? { page: options.page } : {}),
        ...(options?.mediaType ? { mediaType: options.mediaType } : {}),
        ...(options?.listToken ? { listToken: options.listToken } : {}),
      };

      await navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId, stackId: String(stackId) },
        search,
      });
    },
    [datasetId, navigate]
  );

  const onFindSimilar = async (stackId: number | string) => {
    await navigate({
      to: '/library/$datasetId/stacks/$stackId/similar',
      params: { datasetId, stackId: String(stackId) },
    });
  };

  const onAddToScratch = async (stackId: number | string) => {
    const sc = await ensureScratch();
    await apiClient.addStackToCollection(sc.id, Number(stackId));
    await queryClient.invalidateQueries({ queryKey: ['stacks'] });
    await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
  };

  const onInfo = (stackId: number | string) => {
    try {
      setSelectedItemId(stackId);
      setInfoOpen(true);
    } catch {}
  };

  const onToggleFavorite = async (stackId: number | string, favorited: boolean) => {
    const nextFav = !favorited;
    try {
      await apiClient.toggleStackFavorite(stackId, nextFav);
    } finally {
      // Optimistically patch common caches
      try {
        // Tags page caches (infinite)
        const tagQueries = queryClient.getQueriesData<any>({ queryKey: ['tag-stacks'] });
        for (const [key, data] of tagQueries) {
          if (!data?.pages) continue;
          const pages = data.pages.map((pg: any) => ({
            ...pg,
            stacks: Array.isArray(pg.stacks)
              ? pg.stacks.map((s: any) =>
                  String(s.id) === String(stackId)
                    ? { ...s, favorited: nextFav, isFavorite: nextFav }
                    : s
                )
              : pg.stacks,
          }));
          queryClient.setQueryData(key as any, { ...data, pages });
        }

        // AutoTag-config caches (infinite)
        const autoTagQueries = queryClient.getQueriesData<any>({ queryKey: ['autotag-stacks'] });
        for (const [key, data] of autoTagQueries) {
          if (!data?.pages) continue;
          const pages = data.pages.map((pg: any) => ({
            ...pg,
            stacks: Array.isArray(pg.stacks)
              ? pg.stacks.map((s: any) =>
                  String(s.id) === String(stackId)
                    ? { ...s, favorited: nextFav, isFavorite: nextFav }
                    : s
                )
              : pg.stacks,
          }));
          queryClient.setQueryData(key as any, { ...data, pages });
        }

        // Likes yearly caches
        const likesQueries = queryClient.getQueriesData<any>({ queryKey: ['likes', 'yearly'] });
        for (const [key, data] of likesQueries) {
          if (!data?.groupedByMonth) continue;
          const groupedByMonth: Record<string, any[]> = {};
          for (const [month, arr] of Object.entries<any>(data.groupedByMonth)) {
            groupedByMonth[month] = arr.map((it: any) =>
              String(it.stack?.id) === String(stackId)
                ? { ...it, stack: { ...it.stack, favorited: nextFav, isFavorite: nextFav } }
                : it
            );
          }
          queryClient.setQueryData(key as any, { ...data, groupedByMonth });
        }

        // Overview caches
        const overviewData = queryClient.getQueryData<any>(['dataset-overview', datasetId]);
        if (overviewData?.recentLikes) {
          const recentLikes = overviewData.recentLikes.map((it: any) =>
            String(it.id ?? it.stack?.id ?? it) === String(stackId)
              ? {
                  ...it,
                  favorited: nextFav,
                  isFavorite: nextFav,
                  stack: it.stack
                    ? { ...it.stack, favorited: nextFav, isFavorite: nextFav }
                    : it.stack,
                }
              : it
          );
          queryClient.setQueryData(['dataset-overview', datasetId], {
            ...overviewData,
            recentLikes,
          });
        }
      } catch {}

      // Server-truth refresh for robustness
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      await queryClient.invalidateQueries({ queryKey: ['likes', 'yearly'] });
      await queryClient.invalidateQueries({ queryKey: ['tag-stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['autotag-stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] });
    }
  };

  const onLike = async (stackId: number | string) => {
    await apiClient.likeStack(stackId);
    await queryClient.invalidateQueries({ queryKey: ['stacks'] });
  };

  const onRemoveStack = useCallback(
    async (stackId: number | string, stackName?: string) => {
      const label = stackName && stackName.length > 0 ? stackName : 'this stack';
      const confirmed = window.confirm(
        `Are you sure you want to remove ${label}? This action cannot be undone.`
      );
      if (!confirmed) return;

      const numericId =
        typeof stackId === 'string' ? Number.parseInt(stackId, 10) : Number(stackId);
      if (!Number.isFinite(numericId)) {
        console.error('Invalid stack id for removal:', stackId);
        return;
      }

      await apiClient.removeStack(numericId);
      removeStackFromCache(queryClient, numericId);

      if (selectedInfoId && String(selectedInfoId) === String(stackId)) {
        setSelectedItemId(null);
        setInfoOpen(false);
      }

      invalidateAfterRemoval();
      console.log('✅ Stack removed via tile context menu');
    },
    [invalidateAfterRemoval, queryClient, selectedInfoId, setInfoOpen, setSelectedItemId]
  );

  const dragProps = (
    stackId: number | string,
    sourceImageUrl?: string | null,
    sourceImageFilename = `stack-${stackId}.jpg`
  ) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => {
      if ((e.target as HTMLElement | null)?.dataset.nativeImageDrag === 'true') {
        setIsDragging(true);
        setDragKind('native-image');
        setNativeImageDragPreview(e.dataTransfer, e.currentTarget);
        return;
      }

      try {
        setIsDragging(true);
        setStackDragData(e.dataTransfer, [stackId]);
        setExternalImageDragData(e.dataTransfer, sourceImageUrl ?? null, sourceImageFilename);
        e.dataTransfer.effectAllowed = 'copyMove';
      } catch {}
    },
    onDragEnd: () => setIsDragging(false),
  });

  const onRemoveLike = async ({
    activityId,
    stackId,
  }: {
    activityId: number | string;
    stackId: number | string;
  }) => {
    const activityIdNum = Number(activityId);
    if (Number.isNaN(activityIdNum)) {
      return;
    }

    const result = await apiClient.removeLikeActivity(activityIdNum);

    try {
      const normalizedStackId = String(stackId);
      const normalizedActivityId = String(activityIdNum);
      const updatedLiked = Number(result?.liked ?? 0);

      // Remove the like activity from cached yearly likes
      try {
        const likesQueries = queryClient.getQueriesData<any>({ queryKey: ['likes', 'yearly'] });
        for (const [key, data] of likesQueries) {
          if (!data?.groupedByMonth) continue;

          const nextGrouped: Record<string, unknown[]> = {};
          let removed = false;

          const entries = Object.entries(data.groupedByMonth as Record<string, unknown>);
          for (const [monthKey, activities] of entries) {
            if (!Array.isArray(activities)) {
              nextGrouped[monthKey] = [];
              continue;
            }

            const filteredActivities: unknown[] = [];
            for (const item of activities) {
              if (item && typeof item === 'object') {
                const record = item as Record<string, unknown>;
                const entryId = 'id' in record ? record.id : undefined;
                if (String(entryId ?? '') === normalizedActivityId) {
                  removed = true;
                  continue;
                }

                const stackValue = 'stack' in record ? record.stack : undefined;
                if (stackValue && typeof stackValue === 'object') {
                  const stackRecord = stackValue as Record<string, unknown>;
                  const stackIdValue = 'id' in stackRecord ? stackRecord.id : undefined;
                  if (String(stackIdValue ?? '') === normalizedStackId) {
                    filteredActivities.push({
                      ...record,
                      stack: {
                        ...stackRecord,
                        liked: updatedLiked,
                        likeCount: updatedLiked,
                      },
                    });
                    continue;
                  }
                }
              }

              filteredActivities.push(item);
            }

            nextGrouped[monthKey] = filteredActivities;
          }

          if (removed) {
            let nextTotal = data.totalItems;
            if (typeof data.totalItems === 'number') {
              nextTotal = Math.max(data.totalItems - 1, 0);
            }
            queryClient.setQueryData(key as any, {
              ...data,
              groupedByMonth: nextGrouped,
              totalItems: nextTotal,
            });
          }
        }
      } catch {}

      // Update stacks cache entries with the new liked count
      try {
        const stackQueries = queryClient.getQueriesData<any>({ queryKey: ['stacks'] });
        for (const [key, data] of stackQueries) {
          if (!data) continue;

          if (Array.isArray(data.stacks)) {
            const stacks = data.stacks.map((stack: any) =>
              String(stack.id) === normalizedStackId
                ? { ...stack, liked: updatedLiked, likeCount: updatedLiked }
                : stack
            );
            queryClient.setQueryData(key as any, { ...data, stacks });
            continue;
          }

          if (data?.pages) {
            const pages = data.pages.map((page: any) => {
              if (!page?.stacks) return page;
              const stacks = page.stacks.map((stack: any) =>
                String(stack.id) === normalizedStackId
                  ? { ...stack, liked: updatedLiked, likeCount: updatedLiked }
                  : stack
              );
              return { ...page, stacks };
            });
            queryClient.setQueryData(key as any, { ...data, pages });
          }
        }
      } catch {}

      // Update dataset overview cached likes section
      try {
        const overviewData = queryClient.getQueryData<any>(['dataset-overview', datasetId]);
        if (overviewData?.recentLikes) {
          const recentLikes = overviewData.recentLikes.filter((like: any) => {
            const refId = String(like.id ?? like.stackId ?? like.stack?.id ?? '');
            return refId !== normalizedActivityId && refId !== normalizedStackId;
          });
          queryClient.setQueryData(['dataset-overview', datasetId], {
            ...overviewData,
            recentLikes,
          });
        }
      } catch {}
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['likes', 'yearly'] });
      await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      await queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] });
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
    }
  };

  return {
    onOpen,
    onFindSimilar,
    onAddToScratch,
    onToggleFavorite,
    onLike,
    onInfo,
    onRemoveLike,
    onRemoveStack,
    dragProps,
  };
}
