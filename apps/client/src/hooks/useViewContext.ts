import { useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import { apiClient, isApiNotFoundError } from '@/lib/api-client';
import {
  loadViewContext,
  saveViewContext,
  type ViewContext,
  viewContextAtom,
} from '@/stores/view-context';

export function useViewContext() {
  const [ctx, setCtx] = useAtom(viewContextAtom);
  const queryClient = useQueryClient();

  const restore = useCallback(
    (token: string) => {
      const stored = loadViewContext(token);
      if (stored) {
        setCtx(stored);
      }
      return stored;
    },
    [setCtx]
  );

  const update = useCallback(
    (updater: (prev: ViewContext | null) => ViewContext | null) => {
      setCtx((prev) => {
        const next = updater(prev);
        if (next) saveViewContext(next);
        return next;
      });
    },
    [setCtx]
  );

  const set = useCallback(
    (next: ViewContext) => {
      setCtx(next);
      saveViewContext(next);
    },
    [setCtx]
  );

  const currentId = ctx ? ctx.ids[ctx.currentIndex] : undefined;

  const neighbors = useMemo(() => {
    if (!ctx)
      return { prevId: undefined as number | undefined, nextId: undefined as number | undefined };
    return {
      prevId: ctx.currentIndex > 0 ? ctx.ids[ctx.currentIndex - 1] : undefined,
      nextId: ctx.currentIndex < ctx.ids.length - 1 ? ctx.ids[ctx.currentIndex + 1] : undefined,
    };
  }, [ctx]);

  const moveIndex = useCallback(
    (delta: number) => {
      if (!ctx) return false;
      const nextIndex = ctx.currentIndex + delta;
      if (nextIndex < 0 || nextIndex >= ctx.ids.length) return false;
      const next = { ...ctx, currentIndex: nextIndex };
      saveViewContext(next);
      setCtx(next);
      return true;
    },
    [ctx, setCtx]
  );

  const removeIds = useCallback(
    (stackIds: readonly (number | string)[]) => {
      const removeSet = new Set<number>();
      for (const stackId of stackIds) {
        const id = Number(stackId);
        if (Number.isFinite(id)) removeSet.add(id);
      }
      if (removeSet.size === 0) return;

      setCtx((prev) => {
        if (!prev) return prev;
        const ids = prev.ids.filter((id) => !removeSet.has(id));
        if (ids.length === prev.ids.length) return prev;
        if (ids.length === 0) return null;

        const currentId = prev.ids[prev.currentIndex];
        const currentIndex =
          currentId !== undefined && !removeSet.has(currentId)
            ? Math.max(0, ids.indexOf(currentId))
            : Math.min(prev.currentIndex, ids.length - 1);
        const next = { ...prev, ids, currentIndex, createdAt: Date.now() };
        saveViewContext(next);
        return next;
      });
    },
    [setCtx]
  );

  // Optional prefetch for smoother UX
  const prefetchAround = useCallback(
    async (datasetId: string | number, windowSize = 1) => {
      if (!ctx) return;
      const ids: number[] = [];
      for (
        let i = Math.max(0, ctx.currentIndex - windowSize);
        i <= Math.min(ctx.ids.length - 1, ctx.currentIndex + windowSize);
        i++
      ) {
        const id = ctx.ids[i];
        if (id !== undefined) ids.push(id);
      }

      const missingIds: number[] = [];
      await Promise.all(
        ids.map(async (id) => {
          try {
            await queryClient.ensureQueryData({
              queryKey: ['stack', String(datasetId), String(id)],
              queryFn: () => apiClient.getStack(String(id), String(datasetId)),
              staleTime: 60_000,
            });
          } catch (error) {
            if (isApiNotFoundError(error)) missingIds.push(id);
          }
        })
      );
      removeIds(missingIds);
    },
    [ctx, queryClient, removeIds]
  );

  return {
    ctx,
    set,
    update,
    restore,
    currentId,
    neighbors,
    moveIndex,
    removeIds,
    prefetchAround,
  };
}
