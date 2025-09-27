import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  loadViewContext,
  saveViewContext,
  type ViewContext,
  viewContextAtom,
} from '@/stores/view-context';

export function useViewContext() {
  const [ctx, setCtx] = useAtom(viewContextAtom);

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

  // Optional prefetch for smoother UX
  const prefetchAround = useCallback(
    async (datasetId: string | number, windowSize = 1) => {
      if (!ctx) return;
      const promises: Promise<any>[] = [];
      for (
        let i = Math.max(0, ctx.currentIndex - windowSize);
        i <= Math.min(ctx.ids.length - 1, ctx.currentIndex + windowSize);
        i++
      ) {
        const id = ctx.ids[i];
        promises.push(apiClient.getStack(id, datasetId));
      }
      try {
        await Promise.all(promises);
      } catch {
        /* ignore */
      }
    },
    [ctx]
  );

  return {
    ctx,
    set,
    update,
    restore,
    currentId,
    neighbors,
    moveIndex,
    prefetchAround,
  };
}
