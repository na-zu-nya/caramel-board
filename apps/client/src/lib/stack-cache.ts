import type { QueryClient } from '@tanstack/react-query';

const normalizeId = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const filterStacksArray = (input: unknown, targetId: string) => {
  if (!Array.isArray(input)) return { next: input, removed: 0 } as const;
  const filtered: unknown[] = [];
  let removed = 0;
  for (const item of input) {
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const candidate = record.id ?? (record.stack as any)?.id ?? record.stackId;
      if (normalizeId(candidate) === targetId) {
        removed += 1;
        continue;
      }
    }
    filtered.push(item);
  }
  return { next: filtered, removed } as const;
};

export function removeStackFromCache(queryClient: QueryClient, stackId: number | string): void {
  const targetId = normalizeId(stackId);
  if (!targetId) return;

  try {
    const stackDetailQueries = queryClient.getQueriesData({ queryKey: ['stack'] });
    for (const [key] of stackDetailQueries) {
      if (Array.isArray(key) && key.length >= 3) {
        const maybeId = key[key.length - 1];
        if (normalizeId(maybeId) === targetId) {
          queryClient.removeQueries({ queryKey: key as any, exact: true });
        }
      }
    }
  } catch {}

  try {
    const stacksQueries = queryClient.getQueriesData<any>({ queryKey: ['stacks'] });
    for (const [key, data] of stacksQueries) {
      if (!data) continue;

      if (Array.isArray(data.stacks)) {
        const { next, removed } = filterStacksArray(data.stacks, targetId);
        if (removed > 0) {
          queryClient.setQueryData(key as any, {
            ...data,
            stacks: next,
            total: typeof data.total === 'number' ? Math.max(0, data.total - removed) : data.total,
          });
          continue;
        }
      }

      if (Array.isArray(data.pages)) {
        let hasChange = false;
        let removedTotal = 0;
        const pages = data.pages.map((page: any) => {
          if (!page?.stacks) return page;
          const { next, removed } = filterStacksArray(page.stacks, targetId);
          if (removed > 0) {
            hasChange = true;
            removedTotal += removed;
            return {
              ...page,
              stacks: next,
              total:
                typeof page.total === 'number' ? Math.max(0, page.total - removed) : page.total,
            };
          }
          return page;
        });
        if (hasChange) {
          const nextData = { ...data, pages };
          if (typeof data.total === 'number') {
            nextData.total = Math.max(0, data.total - removedTotal);
          }
          queryClient.setQueryData(key as any, nextData);
        }
      }
    }
  } catch {}

  try {
    const tagQueries = queryClient.getQueriesData<any>({ queryKey: ['tag-stacks'] });
    for (const [key, data] of tagQueries) {
      if (!data?.pages) continue;
      let mutated = false;
      let removedTotal = 0;
      const pages = data.pages.map((page: any) => {
        if (!page?.stacks) return page;
        const { next, removed } = filterStacksArray(page.stacks, targetId);
        if (removed > 0) {
          mutated = true;
          removedTotal += removed;
          return {
            ...page,
            stacks: next,
            total: typeof page.total === 'number' ? Math.max(0, page.total - removed) : page.total,
          };
        }
        return page;
      });
      if (mutated) {
        const nextData = { ...data, pages };
        if (typeof data.total === 'number') {
          nextData.total = Math.max(0, data.total - removedTotal);
        }
        queryClient.setQueryData(key as any, nextData);
      }
    }
  } catch {}

  try {
    const autoTagQueries = queryClient.getQueriesData<any>({ queryKey: ['autotag-stacks'] });
    for (const [key, data] of autoTagQueries) {
      if (!data?.pages) continue;
      let mutated = false;
      let removedTotal = 0;
      const pages = data.pages.map((page: any) => {
        if (!page?.stacks) return page;
        const { next, removed } = filterStacksArray(page.stacks, targetId);
        if (removed > 0) {
          mutated = true;
          removedTotal += removed;
          return {
            ...page,
            stacks: next,
            total: typeof page.total === 'number' ? Math.max(0, page.total - removed) : page.total,
          };
        }
        return page;
      });
      if (mutated) {
        const nextData = { ...data, pages };
        if (typeof data.total === 'number') {
          nextData.total = Math.max(0, data.total - removedTotal);
        }
        queryClient.setQueryData(key as any, nextData);
      }
    }
  } catch {}

  try {
    const likesQueries = queryClient.getQueriesData<any>({ queryKey: ['likes', 'yearly'] });
    for (const [key, data] of likesQueries) {
      if (!data?.groupedByMonth) continue;
      let mutated = false;
      const groupedByMonth: Record<string, unknown[]> = {};
      const entries = Object.entries(data.groupedByMonth as Record<string, unknown[]>);
      for (const [monthKey, activities] of entries) {
        if (!Array.isArray(activities)) {
          groupedByMonth[monthKey] = activities;
          continue;
        }
        const filtered: unknown[] = [];
        for (const item of activities) {
          if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>;
            const stackValue = record.stack;
            const candidate =
              stackValue && typeof stackValue === 'object'
                ? (stackValue as Record<string, unknown>).id
                : (record.stackId ?? record.id);
            if (normalizeId(candidate) === targetId) {
              mutated = true;
              continue;
            }
          }
          filtered.push(item);
        }
        groupedByMonth[monthKey] = filtered;
      }
      if (mutated) {
        const nextTotal =
          typeof data.totalItems === 'number' ? Math.max(0, data.totalItems - 1) : data.totalItems;
        queryClient.setQueryData(key as any, {
          ...data,
          groupedByMonth,
          totalItems: nextTotal,
        });
      }
    }
  } catch {}

  try {
    const overviewQueries = queryClient.getQueriesData<any>({ queryKey: ['dataset-overview'] });
    for (const [key, data] of overviewQueries) {
      if (!data?.recentLikes) continue;
      const filtered = data.recentLikes.filter((item: any) => {
        const candidate = item?.id ?? item?.stack?.id ?? item?.stackId;
        return normalizeId(candidate) !== targetId;
      });
      if (filtered.length !== data.recentLikes.length) {
        queryClient.setQueryData(key as any, {
          ...data,
          recentLikes: filtered,
        });
      }
    }
  } catch {}
}
