import type { PrismaClient } from '@prisma/client';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

const normalizeTag = (tag: string) => tag.trim().toLowerCase();

export const createTagStatsService = (deps: {
  prisma: PrismaClient;
  dataSetId: number;
  ttlMs?: number;
}) => {
  const { prisma, dataSetId, ttlMs = DEFAULT_TTL_MS } = deps;

  let datasetCountCache: CacheEntry<number> | null = null;
  const dfCache = new Map<string, CacheEntry<number>>();

  const now = () => Date.now();

  const getCacheKey = (kind: 'auto' | 'manual', tag: string) => `${kind}:${normalizeTag(tag)}`;

  const getCachedValue = (key: string): number | null => {
    const entry = dfCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < now()) {
      dfCache.delete(key);
      return null;
    }
    return entry.value;
  };

  const setCacheValue = (key: string, value: number) => {
    dfCache.set(key, { value, expiresAt: now() + ttlMs });
  };

  const primeCacheForMissing = (kind: 'auto' | 'manual', tags: string[]) => {
    const unique = Array.from(new Set(tags.map(normalizeTag))).filter(Boolean);
    const missing = unique.filter((tag) => getCachedValue(getCacheKey(kind, tag)) === null);
    return { unique, missing };
  };

  async function getDatasetStackCount(): Promise<number> {
    if (datasetCountCache && datasetCountCache.expiresAt >= now()) {
      return datasetCountCache.value;
    }
    const count = await prisma.stack.count({ where: { dataSetId } });
    datasetCountCache = { value: count, expiresAt: now() + ttlMs };
    return count;
  }

  async function getAutoTagDocumentFrequency(
    tags: string[],
    minScore: number
  ): Promise<Map<string, number>> {
    const { unique, missing } = primeCacheForMissing('auto', tags);

    if (missing.length) {
      const query = `
        SELECT LOWER(elem->>'tag') AS tag,
               COUNT(DISTINCT agg."stackId")::int AS df
        FROM "StackAutoTagAggregate" agg
        JOIN "Stack" s ON s.id = agg."stackId"
        JOIN LATERAL jsonb_array_elements(agg."topTags"::jsonb) elem ON TRUE
        WHERE s."dataSetId" = $1
          AND LOWER(elem->>'tag') = ANY($2::text[])
          AND (elem->>'score')::float >= $3
        GROUP BY tag
      `;

      const rows = await prisma.$queryRawUnsafe<Array<{ tag: string; df: number }>>(
        query,
        dataSetId,
        missing,
        minScore
      );

      const seen = new Set<string>();
      for (const row of rows) {
        const tag = normalizeTag(row.tag);
        seen.add(tag);
        setCacheValue(getCacheKey('auto', tag), row.df);
      }

      for (const tag of missing) {
        const norm = normalizeTag(tag);
        if (!seen.has(norm)) {
          setCacheValue(getCacheKey('auto', norm), 0);
        }
      }
    }

    const result = new Map<string, number>();
    for (const tag of unique) {
      const cacheKey = getCacheKey('auto', tag);
      const cached = getCachedValue(cacheKey);
      result.set(normalizeTag(tag), cached ?? 0);
    }
    return result;
  }

  async function getManualTagDocumentFrequency(tags: string[]): Promise<Map<string, number>> {
    const { unique, missing } = primeCacheForMissing('manual', tags);

    if (missing.length) {
      const query = `
        SELECT LOWER(t.title) AS tag,
               COUNT(DISTINCT tos."stackId")::int AS df
        FROM "TagsOnStack" tos
        JOIN "Tag" t ON t.id = tos."tagId"
        JOIN "Stack" s ON s.id = tos."stackId"
        WHERE s."dataSetId" = $1
          AND LOWER(t.title) = ANY($2::text[])
        GROUP BY tag
      `;

      const rows = await prisma.$queryRawUnsafe<Array<{ tag: string; df: number }>>(
        query,
        dataSetId,
        missing
      );

      const seen = new Set<string>();
      for (const row of rows) {
        const tag = normalizeTag(row.tag);
        seen.add(tag);
        setCacheValue(getCacheKey('manual', tag), row.df);
      }

      for (const tag of missing) {
        const norm = normalizeTag(tag);
        if (!seen.has(norm)) {
          setCacheValue(getCacheKey('manual', norm), 0);
        }
      }
    }

    const result = new Map<string, number>();
    for (const tag of unique) {
      const cacheKey = getCacheKey('manual', tag);
      const cached = getCachedValue(cacheKey);
      result.set(normalizeTag(tag), cached ?? 0);
    }
    return result;
  }

  function invalidateCache(options?: { kind?: 'auto' | 'manual'; tags?: string[] }) {
    if (!options) {
      dfCache.clear();
      datasetCountCache = null;
      return;
    }

    if (!options.tags || options.tags.length === 0) {
      if (!options.kind || options.kind === 'auto' || options.kind === 'manual') {
        dfCache.clear();
      }
      datasetCountCache = null;
      return;
    }

    if (!options.kind) {
      for (const kind of ['auto', 'manual'] as const) {
        for (const tag of options.tags) {
          dfCache.delete(getCacheKey(kind, tag));
        }
      }
    } else {
      for (const tag of options.tags) {
        dfCache.delete(getCacheKey(options.kind, tag));
      }
    }
  }

  return {
    getDatasetStackCount,
    getAutoTagDocumentFrequency,
    getManualTagDocumentFrequency,
    invalidateCache,
  };
};
