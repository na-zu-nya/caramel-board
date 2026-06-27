import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAutoTagClient } from '../lib/AutoTagClient';
import { ensureDatasetAuthorizedForCurrentStore } from '../repositories/sqlite/auth';
import {
  type AutoTagStats,
  StandaloneAutoTagRepository,
} from '../repositories/sqlite/auto-tag-repository';

export const autoTagsRoute = new Hono();

interface AutoTagStatisticsResult {
  datasetId: number;
  threshold: number;
  totalTags: number;
  totalPredictions?: number;
  tags: AutoTagStats[];
  method: 'sql' | 'aggregate';
}

type CacheValue = AutoTagStatisticsResult | AutoTagStats[];

interface CacheEntry<TValue = CacheValue> {
  data: TValue;
  timestamp: number;
}

const statisticsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;
const autoTagRepository = new StandaloneAutoTagRepository();

autoTagsRoute.get('/joytag/health', async (c) => {
  try {
    const health = await getAutoTagClient().healthCheck();
    return c.json({ status: 'ok', joytag: health });
  } catch (error) {
    console.error('JoyTag health check failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown JoyTag error';
    return c.json({ status: 'error', message }, 503);
  }
});

function getCacheKey(
  datasetId: number,
  threshold: number,
  limit: number,
  q?: string,
  source?: string,
  includeTotal?: boolean
): string {
  return `${datasetId}-${threshold}-${limit}-${q || ''}-${source || 'raw'}-${includeTotal ? 't' : 'f'}`;
}

function getCachedData<TValue extends CacheValue>(key: string): TValue | null {
  const entry = statisticsCache.get(key) as CacheEntry<TValue> | undefined;
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    statisticsCache.delete(key);
    return null;
  }

  return entry.data;
}

function setCachedData<TValue extends CacheValue>(key: string, data: TValue): void {
  if (statisticsCache.size >= 100) {
    const firstKey = statisticsCache.keys().next().value;
    if (firstKey) statisticsCache.delete(firstKey);
  }

  statisticsCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

async function ensureAuth(c: Context, datasetId: number): Promise<Response | null> {
  return ensureDatasetAuthorizedForCurrentStore(c, datasetId);
}

autoTagsRoute.get(
  '/statistics/:datasetId',
  zValidator(
    'param',
    z.object({
      datasetId: z.string().transform(Number).pipe(z.number().int().positive()),
    })
  ),
  zValidator(
    'query',
    z.object({
      limit: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : 50))
        .pipe(z.number().int().min(1).max(200)),
      threshold: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : 0.4))
        .pipe(z.number().min(0.4).max(1)),
      q: z.string().optional().default(''),
      source: z.enum(['raw', 'aggregate']).optional().default('aggregate'),
      includeTotal: z
        .string()
        .optional()
        .transform((val) => (val ? val === 'true' : false))
        .pipe(z.boolean()),
    })
  ),
  async (c) => {
    const { datasetId } = c.req.valid('param');
    const { limit, threshold, q, source, includeTotal } = c.req.valid('query');

    try {
      const cacheKey = getCacheKey(datasetId, threshold, limit, q, source, includeTotal);
      const cachedResult = getCachedData<AutoTagStatisticsResult>(cacheKey);

      if (cachedResult) {
        return c.json({ ...cachedResult, cached: true });
      }

      const result = autoTagRepository.getStatistics({
        datasetId,
        threshold,
        limit,
        searchQuery: q,
        source,
        includeTotal,
      });
      setCachedData(cacheKey, result);
      return c.json(result);
    } catch (error) {
      console.error('Error getting AutoTag statistics:', error);
      return c.json({ error: 'Failed to get AutoTag statistics' }, 500);
    }
  }
);

autoTagsRoute.get(
  '/statistics/:datasetId/strict',
  zValidator(
    'param',
    z.object({
      datasetId: z.string().transform(Number).pipe(z.number().int().positive()),
    })
  ),
  zValidator(
    'query',
    z.object({
      threshold: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : 0.4))
        .pipe(z.number().min(0.4).max(1)),
      keys: z
        .union([z.array(z.string()), z.string()])
        .transform((v) =>
          Array.isArray(v)
            ? v
            : v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
        )
        .pipe(z.array(z.string()).min(1).max(100)),
    })
  ),
  async (c) => {
    const { datasetId } = c.req.valid('param');
    const { threshold, keys } = c.req.valid('query');

    try {
      const cacheKey = `strict-${datasetId}-${threshold}-${keys
        .map((key) => key.toLowerCase())
        .sort()
        .join('|')}`;
      const cached = getCachedData<AutoTagStats[]>(cacheKey);
      if (cached) {
        return c.json({
          datasetId,
          threshold,
          keys,
          tags: cached,
          method: 'sql-keys',
          cached: true,
        });
      }

      const rows = autoTagRepository.getStrictCountsForKeys(datasetId, threshold, keys);
      setCachedData(cacheKey, rows);
      return c.json({ datasetId, threshold, keys, tags: rows, method: 'sql-keys' });
    } catch (error) {
      console.error('Error getting strict counts for keys:', error);
      return c.json({ error: 'Failed to get strict counts for keys' }, 500);
    }
  }
);

autoTagsRoute.get(
  '/mappings/:datasetId',
  zValidator(
    'param',
    z.object({
      datasetId: z.string().transform(Number).pipe(z.number().int().positive()),
    })
  ),
  zValidator(
    'query',
    z.object({
      limit: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : 100))
        .pipe(z.number().int().min(1).max(200)),
      offset: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : 0))
        .pipe(z.number().int().min(0)),
    })
  ),
  async (c) => {
    const { datasetId } = c.req.valid('param');
    const { limit, offset } = c.req.valid('query');

    try {
      const auth = await ensureAuth(c, datasetId);
      if (auth) return auth;
      return c.json(autoTagRepository.getMappings(datasetId, limit, offset));
    } catch (error) {
      console.error('Error getting AutoTag mappings:', error);
      return c.json({ error: 'Failed to get AutoTag mappings' }, 500);
    }
  }
);

autoTagsRoute.post(
  '/mappings/:datasetId',
  zValidator(
    'param',
    z.object({
      datasetId: z.string().transform(Number).pipe(z.number().int().positive()),
    })
  ),
  zValidator(
    'json',
    z.object({
      autoTagKey: z.string().min(1),
      tagId: z.number().int().positive().optional(),
      displayName: z.string().min(1),
      description: z.string().optional(),
      isActive: z.boolean().optional().default(true),
    })
  ),
  async (c) => {
    const { datasetId } = c.req.valid('param');
    const { autoTagKey, tagId, displayName, description, isActive } = c.req.valid('json');

    try {
      const result = autoTagRepository.upsertMapping(datasetId, {
        autoTagKey,
        tagId,
        displayName,
        description,
        isActive,
      });
      if (result.conflict) {
        return c.json({ error: 'This tag is already assigned to another AutoTag mapping' }, 400);
      }
      return c.json(result.mapping);
    } catch (error) {
      console.error('Error creating/updating AutoTag mapping:', error);
      return c.json({ error: 'Failed to create/update AutoTag mapping' }, 500);
    }
  }
);

autoTagsRoute.put(
  '/mappings/:datasetId/:mappingId',
  zValidator(
    'param',
    z.object({
      datasetId: z.string().transform(Number).pipe(z.number().int().positive()),
      mappingId: z.string().transform(Number).pipe(z.number().int().positive()),
    })
  ),
  zValidator(
    'json',
    z.object({
      tagId: z.number().int().positive().optional(),
      displayName: z.string().min(1).optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
    })
  ),
  async (c) => {
    const { datasetId, mappingId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const result = autoTagRepository.updateMapping(datasetId, mappingId, updateData);
      if (!result) {
        return c.json({ error: 'Mapping not found in this dataset' }, 404);
      }
      if (result.conflict) {
        return c.json({ error: 'This tag is already assigned to another AutoTag mapping' }, 400);
      }
      return c.json(result.mapping);
    } catch (error) {
      console.error('Error updating AutoTag mapping:', error);
      return c.json({ error: 'Failed to update AutoTag mapping' }, 500);
    }
  }
);

autoTagsRoute.delete(
  '/mappings/:datasetId/:mappingId',
  zValidator(
    'param',
    z.object({
      datasetId: z.string().transform(Number).pipe(z.number().int().positive()),
      mappingId: z.string().transform(Number).pipe(z.number().int().positive()),
    })
  ),
  async (c) => {
    const { datasetId, mappingId } = c.req.valid('param');

    try {
      const ok = autoTagRepository.deleteMapping(datasetId, mappingId);
      if (!ok) {
        return c.json({ error: 'Mapping not found in this dataset' }, 404);
      }
      return c.json({ success: true });
    } catch (error) {
      console.error('Error deleting AutoTag mapping:', error);
      return c.json({ error: 'Failed to delete AutoTag mapping' }, 500);
    }
  }
);
