import { apiClient } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useDrag } from '@/contexts/DragContext';
import { useScratch } from '@/hooks/useScratch';
import { useSetAtom } from 'jotai';
import { infoSidebarOpenAtom, selectedItemIdAtom } from '@/stores/ui';

export function useStackTile(datasetId: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setIsDragging } = useDrag();
  const { ensureScratch } = useScratch(datasetId);
  const setInfoOpen = useSetAtom(infoSidebarOpenAtom);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);

  const onOpen = async (stackId: number | string) => {
    await navigate({ to: '/library/$datasetId/stacks/$stackId', params: { datasetId, stackId: String(stackId) } });
  };

  const onFindSimilar = async (stackId: number | string) => {
    await navigate({ to: '/library/$datasetId/stacks/$stackId/similar', params: { datasetId, stackId: String(stackId) } });
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
              ? pg.stacks.map((s: any) => (String(s.id) === String(stackId) ? { ...s, favorited: nextFav, isFavorite: nextFav } : s))
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
              ? pg.stacks.map((s: any) => (String(s.id) === String(stackId) ? { ...s, favorited: nextFav, isFavorite: nextFav } : s))
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
              ? { ...it, favorited: nextFav, isFavorite: nextFav, stack: it.stack ? { ...it.stack, favorited: nextFav, isFavorite: nextFav } : it.stack }
              : it
          );
          queryClient.setQueryData(['dataset-overview', datasetId], { ...overviewData, recentLikes });
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

  const dragProps = (stackId: number | string) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => {
      try {
        setIsDragging(true);
        e.dataTransfer.setData('text/plain', `stack-item:${stackId}`);
        e.dataTransfer.effectAllowed = 'copyMove';
      } catch {}
    },
    onDragEnd: () => setIsDragging(false),
  });

  return { onOpen, onFindSimilar, onAddToScratch, onToggleFavorite, onLike, onInfo, dragProps };
}
