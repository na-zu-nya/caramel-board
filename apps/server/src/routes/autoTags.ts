import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../shared/di';

export const autoTagsRoute = new Hono();

// Simple in-memory cache for statistics
interface CacheEntry {
  data: any;
  timestamp: number;
}

const statisticsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5分間のキャッシュ

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

function getCachedData(key: string): any | null {
  const entry = statisticsCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    statisticsCache.delete(key);
    return null;
  }

  return entry.data;
}

function setCachedData(key: string, data: any): void {
  // キャッシュサイズ制限（最大100エントリ）
  if (statisticsCache.size >= 100) {
    const firstKey = statisticsCache.keys().next().value;
    if (firstKey) statisticsCache.delete(firstKey);
  }

  statisticsCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

// Helper function to execute raw SQL for better performance with JSONB
async function getAutoTagStatisticsOptimized(
  datasetId: number,
  threshold: number,
  limit: number,
  searchQuery?: string
) {
  // PostgreSQL の JSONB 関数を使用した効率的な集計クエリ
  const query = `
    WITH tag_scores AS (
      SELECT 
        jsonb_each_text(atp.scores::jsonb) as tag_score,
        atp."assetId"
      FROM "AutoTagPrediction" atp
      INNER JOIN "Asset" a ON a.id = atp."assetId"
      INNER JOIN "Stack" s ON s.id = a."stackId"
      WHERE s."dataSetId" = $1
    ),
    filtered_tags AS (
      SELECT 
        (tag_score).key as tag,
        (tag_score).value::float as score,
        "assetId"
      FROM tag_scores
      WHERE (tag_score).value::float >= $2
    ),
    tag_aggregates AS (
      SELECT 
        tag,
        COUNT(*) as prediction_count,
        COUNT(DISTINCT "assetId") as asset_count
      FROM filtered_tags
      ${searchQuery ? 'WHERE LOWER(tag) LIKE LOWER($4)' : ''}
      GROUP BY tag
    )
    SELECT 
      tag as "autoTagKey",
      prediction_count::int as "predictionCount",
      asset_count::int as "assetCount"
    FROM tag_aggregates
    ORDER BY prediction_count DESC
    LIMIT $3
  `;

  const params: any[] = [datasetId, threshold, limit];
  if (searchQuery) {
    params.push(`%${searchQuery}%`);
  }

  try {
    const result = await prisma.$queryRawUnsafe<
      Array<{
        autoTagKey: string;
        predictionCount: number;
        assetCount: number;
      }>
    >(query, ...params);

    return result;
  } catch (error) {
    console.error('Error in raw SQL query:', error);
    throw error;
  }
}

// Helper: Aggregate from StackAutoTagAggregate.topTags (fast path)
async function getAutoTagStatisticsFromAggregate(
  datasetId: number,
  threshold: number,
  limit: number,
  searchQuery?: string
) {
  // Count stacks that contain the tag in topTags over threshold.
  // Also sum assetCount of those stacks as an inexpensive proxy for assets.
  const query = `
    WITH matched AS (
      SELECT 
        (elem->>'tag') AS tag,
        (elem->>'score')::float AS score,
        agg."assetCount" as asset_count
      FROM "StackAutoTagAggregate" agg
      JOIN "Stack" s ON s.id = agg."stackId"
      CROSS JOIN LATERAL jsonb_array_elements(agg."topTags"::jsonb) AS elem
      WHERE s."dataSetId" = $1
        AND (elem->>'score')::float >= $2
        ${searchQuery ? "AND LOWER(elem->>'tag') LIKE LOWER($4)" : ''}
    )
    SELECT 
      tag as "autoTagKey",
      COUNT(*)::int as "predictionCount", -- here this means stack occurrences
      COALESCE(SUM(asset_count), 0)::int as "assetCount"
    FROM matched
    GROUP BY tag
    ORDER BY "predictionCount" DESC
    LIMIT $3
  `;

  const params: any[] = [datasetId, threshold, limit];
  if (searchQuery) params.push(`%${searchQuery}%`);

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      autoTagKey: string;
      predictionCount: number;
      assetCount: number;
    }>
  >(query, ...params);

  return rows;
}

// Authorization middleware helper per request (datasetId from params or query)
async function ensureAuth(c: any, datasetId: number) {
  const { ensureDatasetAuthorized } = await import('../utils/dataset-protection');
  const resp = await ensureDatasetAuthorized(c, datasetId);
  if (resp) return resp;
  return null;
}

// Optimized strict counts for a specific set of keys (exact match) from AutoTagPrediction
async function getStrictCountsForKeys(datasetId: number, threshold: number, keys: string[]) {
  if (keys.length === 0)
    return [] as Array<{ autoTagKey: string; predictionCount: number; assetCount: number }>;

  // Lowercase once for matching
  const lowered = keys.map((k) => k.toLowerCase());

  const query = `
    WITH preds AS (
      SELECT atp."assetId", atp.scores::jsonb AS scores
      FROM "AutoTagPrediction" atp
      JOIN "Asset" a ON a.id = atp."assetId"
      JOIN "Stack" s ON s.id = a."stackId"
      WHERE s."dataSetId" = $1
        AND atp.scores ?| $3::text[] -- prefilter: any of keys exist as fields
    ), kv AS (
      SELECT LOWER(kv.key) AS tag, (kv.value)::float AS score, p."assetId"
      FROM preds p, LATERAL jsonb_each_text(p.scores) kv
      WHERE LOWER(kv.key) = ANY($4)
        AND (kv.value)::float >= $2
    ), agg AS (
      SELECT tag, COUNT(*) AS prediction_count, COUNT(DISTINCT "assetId") AS asset_count
      FROM kv
      GROUP BY tag
    )
    SELECT k.key AS "autoTagKey",
           COALESCE(a.prediction_count, 0)::int AS "predictionCount",
           COALESCE(a.asset_count, 0)::int AS "assetCount"
    FROM unnest($3::text[]) AS k(key)
    LEFT JOIN agg a ON a.tag = k.key
  `;

  const rows = await prisma.$queryRawUnsafe<
    Array<{ autoTagKey: string; predictionCount: number; assetCount: number }>
  >(query, datasetId, threshold, keys, lowered);

  // Return with original key casing if possible
  const mapOrig = new Map(lowered.map((l, i) => [l, keys[i]]));
  return rows.map((r) => ({ ...r, autoTagKey: mapOrig.get(r.autoTagKey) || r.autoTagKey }));
}

// Get AutoTag statistics (most frequent tags across a dataset)
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
      // キャッシュチェック
      const cacheKey = getCacheKey(datasetId, threshold, limit, q, source, includeTotal);
      const cachedResult = getCachedData(cacheKey);

      if (cachedResult) {
        console.log(`Cache hit for AutoTag statistics (dataset: ${datasetId})`);
        return c.json({ ...cachedResult, cached: true });
      }
      // ソース選択: クエリ優先、未指定の場合は環境変数/デフォルト
      const envPrefersRaw = process.env.AUTOTAG_USE_RAW_SQL !== 'false';
      const useRawSQL = source === 'raw' || (source !== 'aggregate' && envPrefersRaw);

      let tags: Array<{
        autoTagKey: string;
        predictionCount: number;
        assetCount: number;
      }>;
      let totalPredictions: number | undefined;

      if (useRawSQL) {
        // SQL最適化版を使用（推奨）
        console.log(`Using optimized SQL for AutoTag statistics (dataset: ${datasetId})`);

        if (includeTotal) {
          // 総予測数（必要な時のみ）
          totalPredictions = await prisma.autoTagPrediction.count({
            where: {
              asset: {
                stack: {
                  dataSetId: datasetId,
                },
              },
            },
          });
        }

        // 最適化されたSQLクエリで集計
        tags = await getAutoTagStatisticsOptimized(datasetId, threshold, limit, q);
      } else {
        // 集計テーブルからの取得（高速パス）
        console.log(`Using aggregate table for AutoTag statistics (dataset: ${datasetId})`);

        // 集計テーブルからの集計は非常に高速。総予測数はデフォルト未計算。
        if (includeTotal) {
          totalPredictions = await prisma.autoTagPrediction.count({
            where: { asset: { stack: { dataSetId: datasetId } } },
          });
        }

        tags = await getAutoTagStatisticsFromAggregate(datasetId, threshold, limit, q);
      }

      const result = {
        datasetId,
        threshold,
        totalTags: tags.length,
        totalPredictions,
        tags,
        method: useRawSQL ? 'sql' : 'aggregate',
      };

      // 結果をキャッシュに保存
      setCachedData(cacheKey, result);

      return c.json(result);
    } catch (error) {
      console.error('Error getting AutoTag statistics:', error);
      return c.json({ error: 'Failed to get AutoTag statistics' }, 500);
    }
  }
);

// Strict counts endpoint for specified keys (delayed refinement use-case)
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
        .map((k) => k.toLowerCase())
        .sort()
        .join('|')}`;
      const cached = getCachedData(cacheKey);
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

      const rows = await getStrictCountsForKeys(datasetId, threshold, keys);

      setCachedData(cacheKey, rows);
      return c.json({ datasetId, threshold, keys, tags: rows, method: 'sql-keys' });
    } catch (error) {
      console.error('Error getting strict counts for keys:', error);
      return c.json({ error: 'Failed to get strict counts for keys' }, 500);
    }
  }
);

// Get AutoTag mappings for a dataset
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
      if (auth) return auth as any;
      const [mappings, total] = await Promise.all([
        prisma.autoTagMapping.findMany({
          where: { dataSetId: datasetId },
          include: {
            tag: true,
          },
          orderBy: { autoTagKey: 'asc' },
          take: limit,
          skip: offset,
        }),
        prisma.autoTagMapping.count({
          where: { dataSetId: datasetId },
        }),
      ]);

      return c.json({
        mappings,
        total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('Error getting AutoTag mappings:', error);
      return c.json({ error: 'Failed to get AutoTag mappings' }, 500);
    }
  }
);

// Create or update AutoTag mapping
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
      // If linking to a user Tag, ensure the tag is not already assigned to another AutoTag mapping
      if (tagId) {
        const existing = await prisma.autoTagMapping.findFirst({
          where: { dataSetId: datasetId, tagId },
          select: { id: true, autoTagKey: true },
        });
        if (existing && existing.autoTagKey !== autoTagKey) {
          return c.json({ error: 'This tag is already assigned to another AutoTag mapping' }, 400);
        }
      }

      const mapping = await prisma.autoTagMapping.upsert({
        where: {
          autoTagKey_dataSetId: {
            autoTagKey,
            dataSetId: datasetId,
          },
        },
        update: {
          tagId,
          displayName,
          description,
          isActive,
          updatedAt: new Date(),
        },
        create: {
          autoTagKey,
          tagId,
          displayName,
          description,
          isActive,
          dataSetId: datasetId,
        },
        include: {
          tag: true,
        },
      });

      return c.json(mapping);
    } catch (error) {
      console.error('Error creating/updating AutoTag mapping:', error);
      return c.json({ error: 'Failed to create/update AutoTag mapping' }, 500);
    }
  }
);

// Update AutoTag mapping
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
      // First verify the mapping belongs to this dataset
      const existingMapping = await prisma.autoTagMapping.findUnique({
        where: { id: mappingId },
      });

      if (!existingMapping || existingMapping.dataSetId !== datasetId) {
        return c.json({ error: 'Mapping not found in this dataset' }, 404);
      }

      // If changing tagId, ensure it's not already used by another mapping in this dataset
      if (updateData.tagId) {
        const conflict = await prisma.autoTagMapping.findFirst({
          where: {
            dataSetId: datasetId,
            tagId: updateData.tagId,
            NOT: { id: mappingId },
          },
          select: { id: true },
        });
        if (conflict) {
          return c.json({ error: 'This tag is already assigned to another AutoTag mapping' }, 400);
        }
      }

      const mapping = await prisma.autoTagMapping.update({
        where: {
          id: mappingId,
        },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
        include: {
          tag: true,
        },
      });

      return c.json(mapping);
    } catch (error) {
      console.error('Error updating AutoTag mapping:', error);
      return c.json({ error: 'Failed to update AutoTag mapping' }, 500);
    }
  }
);

// Delete AutoTag mapping
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
      // First verify the mapping belongs to this dataset
      const existingMapping = await prisma.autoTagMapping.findUnique({
        where: { id: mappingId },
      });

      if (!existingMapping || existingMapping.dataSetId !== datasetId) {
        return c.json({ error: 'Mapping not found in this dataset' }, 404);
      }

      await prisma.autoTagMapping.delete({
        where: {
          id: mappingId,
        },
      });

      return c.json({ success: true });
    } catch (error) {
      console.error('Error deleting AutoTag mapping:', error);
      return c.json({ error: 'Failed to delete AutoTag mapping' }, 500);
    }
  }
);
