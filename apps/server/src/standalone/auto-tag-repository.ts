import type { DatabaseSync } from 'node:sqlite';
import { getAutoTagClient } from '../lib/AutoTagClient';
import { getStandaloneSqlite, nowIso } from './sqlite';

export interface AutoTagStats {
  autoTagKey: string;
  predictionCount: number;
  assetCount: number;
}

export interface AutoTagStatisticsOptions {
  datasetId: number;
  threshold: number;
  limit: number;
  searchQuery?: string;
  source: 'raw' | 'aggregate';
  includeTotal?: boolean;
}

interface CountRow {
  count: number;
}

interface AutoTagStatsRow {
  autoTagKey: string;
  predictionCount: number;
  assetCount: number;
}

interface MappingRow {
  id: number;
  dataset_id: number;
  tag_id: number | null;
  auto_tag_key: string;
  display_name: string;
  description: string | null;
  is_active: number;
  is_stop: number;
  created_at: string;
  updated_at: string;
  tag_title: string | null;
}

interface ScoreRow {
  asset_id: number;
  tag_key: string;
  score: number;
}

interface AssetPredictionRow {
  id: number;
  stack_id: number;
  file: string;
  file_type: string;
}

interface AssetCandidateRow {
  id: number;
  stack_id: number;
}

interface PredictionIdRow {
  id: number;
}

interface StandaloneTagPrediction {
  predicted_tags: string[];
  tag_count: number;
  threshold: number;
  scores: Record<string, unknown>;
  processing_time_ms?: number;
}

const likeQuery = (query: string | undefined) => `%${query?.trim() ?? ''}%`;
const AUTO_TAG_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff',
]);
const AUTO_TAG_IMAGE_EXTENSION_LIST = [...AUTO_TAG_IMAGE_EXTENSIONS];
const MIN_NORMALIZED_AUTO_TAG_SCORE = 0.4;
const MAX_FALLBACK_NORMALIZED_SCORES_PER_PREDICTION = 200;

const isAutoTagImageExtension = (ext: string) =>
  AUTO_TAG_IMAGE_EXTENSIONS.has(ext.replace(/^\./, '').toLowerCase());

const toFiniteScore = (value: unknown) => {
  const score = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(score) ? score : null;
};

const normalizeAutoTagKey = (tagKey: string) => tagKey.trim().toLowerCase();

const predictionTagKeySet = (predictedTags: string[]) =>
  new Set(predictedTags.map(normalizeAutoTagKey).filter(Boolean));

const scoreEntriesFromPrediction = (
  scores: Record<string, unknown>,
  predictedTags: string[],
  threshold: number
) => {
  const predictedTagKeys = predictionTagKeySet(predictedTags);
  const usePredictedTags = predictedTagKeys.size > 0;
  const minScore = Math.max(threshold, MIN_NORMALIZED_AUTO_TAG_SCORE);
  const entries: Array<{ tagKey: string; score: number }> = [];

  for (const [tagKey, value] of Object.entries(scores)) {
    const normalizedTagKey = normalizeAutoTagKey(tagKey);
    if (!normalizedTagKey) continue;
    if (usePredictedTags && !predictedTagKeys.has(normalizedTagKey)) continue;
    const score = toFiniteScore(value);
    if (score === null) continue;
    if (!usePredictedTags && score < minScore) continue;
    entries.push({ tagKey, score });
  }

  entries.sort((left, right) => right.score - left.score);
  if (predictedTagKeys.size > 0) {
    return entries;
  }

  return entries.slice(0, MAX_FALLBACK_NORMALIZED_SCORES_PER_PREDICTION);
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAutoTagLoadingError = (error: unknown) => {
  if (!isRecord(error)) return false;
  const response = error.response;
  if (!isRecord(response)) return false;
  if (response.status !== 503) return false;
  const data = response.data;
  if (!isRecord(data)) return true;
  return data.status === 'loading';
};

const toMapping = (row: MappingRow) => ({
  id: row.id,
  dataSetId: row.dataset_id,
  datasetId: row.dataset_id,
  tagId: row.tag_id,
  autoTagKey: row.auto_tag_key,
  displayName: row.display_name,
  description: row.description ?? undefined,
  isActive: row.is_active === 1,
  isStop: row.is_stop === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  tag: row.tag_id && row.tag_title ? { id: row.tag_id, title: row.tag_title } : null,
});

interface PredictAssetTagsOptions {
  forceRegenerate?: boolean;
  aggregateStack?: boolean;
}

export class StandaloneAutoTagRepository {
  constructor(private db: DatabaseSync = getStandaloneSqlite()) {}

  async predictAssetTags(assetId: number, threshold = 0.4, options: PredictAssetTagsOptions = {}) {
    const asset = this.db
      .prepare('SELECT id, stack_id, file, file_type FROM assets WHERE id = ?')
      .get(assetId) as AssetPredictionRow | undefined;
    if (!asset) {
      return { predicted: false as const, reason: 'asset-not-found' };
    }
    if (!isAutoTagImageExtension(asset.file_type)) {
      return { predicted: false as const, reason: 'unsupported-file-type' };
    }

    const existing = this.db
      .prepare('SELECT id FROM auto_tag_predictions WHERE asset_id = ? LIMIT 1')
      .get(assetId) as PredictionIdRow | undefined;
    if (existing && !options.forceRegenerate) {
      return { predicted: false as const, reason: 'already-predicted' };
    }

    const prediction = await this.generateTagsWithRetry(asset.file, threshold);
    this.saveAssetPrediction(asset.id, prediction, threshold);
    if (options.aggregateStack !== false) {
      this.aggregateStackTags(asset.stack_id, threshold);
    }

    return { predicted: true as const, stackId: asset.stack_id, tagCount: prediction.tag_count };
  }

  async refreshStackTags(
    stackId: number,
    options: { threshold?: number; forceRegenerate?: boolean } = {}
  ) {
    const threshold = options.threshold ?? 0.4;
    const forceRegenerate = options.forceRegenerate ?? true;
    const stack = this.db.prepare('SELECT id FROM stacks WHERE id = ?').get(stackId);
    if (!stack) throw new Error('Stack not found');

    const assets = this.db
      .prepare(
        `SELECT id, stack_id
         FROM assets
         WHERE stack_id = ?
           AND LOWER(REPLACE(file_type, '.', '')) IN (${AUTO_TAG_IMAGE_EXTENSION_LIST.map(() => '?').join(', ')})
         ORDER BY order_in_stack ASC, id ASC`
      )
      .all(stackId, ...AUTO_TAG_IMAGE_EXTENSION_LIST) as AssetCandidateRow[];

    let predicted = 0;
    let skipped = 0;
    let failed = 0;

    for (const asset of assets) {
      try {
        const result = await this.predictAssetTags(asset.id, threshold, {
          forceRegenerate,
          aggregateStack: false,
        });
        if (result.predicted) {
          predicted++;
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        console.error(`Failed to refresh standalone AutoTags for asset ${asset.id}:`, error);
      }
    }

    return {
      stackId,
      candidateAssets: assets.length,
      predictedAssets: predicted,
      skippedAssets: skipped,
      failedAssets: failed,
      aggregate: this.aggregateStackTags(stackId, threshold),
    };
  }

  async predictDatasetAssetTags(
    datasetId: number,
    options: { threshold?: number; forceRegenerate?: boolean } = {}
  ) {
    const threshold = options.threshold ?? 0.4;
    const existingFilter = options.forceRegenerate ? '' : 'AND p.asset_id IS NULL';
    const rows = this.db
      .prepare(
        `SELECT a.id, a.stack_id
         FROM assets a
         JOIN stacks s ON s.id = a.stack_id
         LEFT JOIN auto_tag_predictions p ON p.asset_id = a.id
         WHERE s.dataset_id = ?
           AND LOWER(REPLACE(a.file_type, '.', '')) IN (${AUTO_TAG_IMAGE_EXTENSION_LIST.map(() => '?').join(', ')})
           ${existingFilter}
         ORDER BY a.id ASC`
      )
      .all(datasetId, ...AUTO_TAG_IMAGE_EXTENSION_LIST) as AssetCandidateRow[];

    let predicted = 0;
    let skipped = 0;
    let failed = 0;
    const stackIds = new Set<number>();

    for (const row of rows) {
      try {
        const result = await this.predictAssetTags(row.id, threshold, {
          forceRegenerate: options.forceRegenerate,
          aggregateStack: false,
        });
        if (result.predicted) {
          predicted++;
          stackIds.add(result.stackId);
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        console.error(`Failed to predict standalone AutoTags for asset ${row.id}:`, error);
      }
    }

    let aggregatedStacks = 0;
    for (const stackId of stackIds) {
      try {
        this.aggregateStackTags(stackId, threshold);
        aggregatedStacks++;
      } catch (error) {
        console.error(`Failed to aggregate AutoTags for stack ${stackId}:`, error);
      }
    }

    return {
      datasetId,
      candidateAssets: rows.length,
      predictedAssets: predicted,
      skippedAssets: skipped,
      failedAssets: failed,
      aggregatedStacks,
    };
  }

  getStatistics(options: AutoTagStatisticsOptions) {
    const tags =
      options.source === 'raw'
        ? this.getStatisticsFromPredictions(options)
        : this.getStatisticsFromAggregates(options);

    return {
      datasetId: options.datasetId,
      threshold: options.threshold,
      totalTags: tags.length,
      totalPredictions: options.includeTotal ? this.countPredictions(options.datasetId) : undefined,
      tags,
      method: options.source === 'raw' ? 'sql' : 'aggregate',
    };
  }

  getStrictCountsForKeys(datasetId: number, threshold: number, keys: string[]) {
    if (keys.length === 0) return [];
    const lowered = keys.map((key) => key.toLowerCase());
    const rows = this.db
      .prepare(
        `SELECT lower(scores.tag_key) AS autoTagKey,
                COUNT(*) AS predictionCount,
                COUNT(DISTINCT scores.asset_id) AS assetCount
         FROM auto_tag_prediction_scores scores
         JOIN assets a ON a.id = scores.asset_id
         JOIN stacks s ON s.id = a.stack_id
         WHERE s.dataset_id = ?
           AND scores.score >= ?
           AND lower(scores.tag_key) IN (${lowered.map(() => '?').join(', ')})
         GROUP BY lower(scores.tag_key)`
      )
      .all(datasetId, threshold, ...lowered) as AutoTagStatsRow[];

    const byKey = new Map(rows.map((row) => [row.autoTagKey, row]));
    return lowered.map((key, index) => {
      const row = byKey.get(key);
      return {
        autoTagKey: keys[index],
        predictionCount: row?.predictionCount ?? 0,
        assetCount: row?.assetCount ?? 0,
      };
    });
  }

  getMappings(datasetId: number, limit: number, offset: number) {
    const rows = this.db
      .prepare(
        `SELECT m.*, t.title AS tag_title
         FROM auto_tag_mappings m
         LEFT JOIN tags t ON t.id = m.tag_id
         WHERE m.dataset_id = ?
         ORDER BY m.auto_tag_key ASC
         LIMIT ? OFFSET ?`
      )
      .all(datasetId, limit, offset) as MappingRow[];
    const total =
      (
        this.db
          .prepare('SELECT COUNT(*) AS count FROM auto_tag_mappings WHERE dataset_id = ?')
          .get(datasetId) as CountRow | undefined
      )?.count ?? 0;

    return {
      mappings: rows.map(toMapping),
      total,
      limit,
      offset,
    };
  }

  upsertMapping(
    datasetId: number,
    values: {
      autoTagKey: string;
      tagId?: number;
      displayName: string;
      description?: string;
      isActive: boolean;
    }
  ) {
    if (values.tagId && this.hasTagConflict(datasetId, values.tagId, values.autoTagKey)) {
      return { conflict: true as const };
    }

    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO auto_tag_mappings
           (dataset_id, tag_id, auto_tag_key, display_name, description, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(auto_tag_key, dataset_id) DO UPDATE SET
           tag_id = excluded.tag_id,
           display_name = excluded.display_name,
           description = excluded.description,
           is_active = excluded.is_active,
           updated_at = excluded.updated_at`
      )
      .run(
        datasetId,
        values.tagId ?? null,
        values.autoTagKey,
        values.displayName,
        values.description ?? null,
        values.isActive ? 1 : 0,
        now,
        now
      );

    const mapping = this.getMappingByKey(datasetId, values.autoTagKey);
    if (!mapping) throw new Error('AutoTag mapping upsert failed');
    return { conflict: false as const, mapping };
  }

  updateMapping(
    datasetId: number,
    mappingId: number,
    values: {
      tagId?: number;
      displayName?: string;
      description?: string;
      isActive?: boolean;
    }
  ) {
    const existing = this.getMappingById(datasetId, mappingId);
    if (!existing) return null;
    if (
      values.tagId &&
      this.hasTagConflict(datasetId, values.tagId, existing.autoTagKey, mappingId)
    ) {
      return { conflict: true as const };
    }

    this.db
      .prepare(
        `UPDATE auto_tag_mappings
         SET tag_id = ?,
             display_name = ?,
             description = ?,
             is_active = ?,
             updated_at = ?
         WHERE id = ? AND dataset_id = ?`
      )
      .run(
        values.tagId ?? existing.tagId,
        values.displayName ?? existing.displayName,
        values.description ?? existing.description ?? null,
        values.isActive === undefined ? (existing.isActive ? 1 : 0) : values.isActive ? 1 : 0,
        nowIso(),
        mappingId,
        datasetId
      );

    const mapping = this.getMappingById(datasetId, mappingId);
    if (!mapping) throw new Error('AutoTag mapping update failed');
    return { conflict: false as const, mapping };
  }

  deleteMapping(datasetId: number, mappingId: number) {
    const result = this.db
      .prepare('DELETE FROM auto_tag_mappings WHERE id = ? AND dataset_id = ?')
      .run(mappingId, datasetId);
    return result.changes > 0;
  }

  getMatchingStackIds(datasetId: number, autoTags: string[], threshold = 0.4) {
    const lowered = autoTags.map((tag) => tag.toLowerCase());
    if (lowered.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT DISTINCT scores.stack_id AS id
         FROM stack_auto_tag_scores scores
         JOIN stacks s ON s.id = scores.stack_id
         WHERE s.dataset_id = ?
           AND scores.score >= ?
           AND lower(scores.tag_key) IN (${lowered.map(() => '?').join(', ')})
         ORDER BY scores.stack_id DESC`
      )
      .all(datasetId, threshold, ...lowered) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  aggregateStackTags(stackId: number, threshold = 0.4) {
    const stack = this.db.prepare('SELECT id FROM stacks WHERE id = ?').get(stackId);
    if (!stack) throw new Error('Stack not found');

    const assetCount =
      (
        this.db.prepare('SELECT COUNT(*) AS count FROM assets WHERE stack_id = ?').get(stackId) as
          | CountRow
          | undefined
      )?.count ?? 0;
    if (assetCount === 0) {
      return {
        stackId,
        aggregatedTags: {},
        topTags: [],
        assetCount: 0,
        skippedAssets: 0,
        processingTime: Date.now(),
      };
    }

    const rows = this.db
      .prepare(
        `SELECT scores.asset_id, scores.tag_key, scores.score
         FROM auto_tag_prediction_scores scores
         JOIN assets a ON a.id = scores.asset_id
         WHERE a.stack_id = ?`
      )
      .all(stackId) as ScoreRow[];
    const processedAssets = new Set(rows.map((row) => row.asset_id)).size;
    if (processedAssets === 0) {
      return {
        stackId,
        aggregatedTags: {},
        topTags: [],
        assetCount: 0,
        skippedAssets: assetCount,
        processingTime: Date.now(),
      };
    }

    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.score >= threshold) {
        totals.set(row.tag_key, (totals.get(row.tag_key) ?? 0) + row.score);
      }
    }

    const aggregatedTags = Object.fromEntries(
      [...totals.entries()].map(([tag, score]) => [tag, score / processedAssets])
    );
    const topTags = Object.entries(aggregatedTags)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([tag, score]) => ({ tag, score }));

    this.saveStackAggregate(stackId, aggregatedTags, topTags, processedAssets, threshold);

    return {
      stackId,
      aggregatedTags,
      topTags,
      assetCount: processedAssets,
      skippedAssets: assetCount - processedAssets,
      processingTime: Date.now(),
    };
  }

  private getStatisticsFromPredictions(options: AutoTagStatisticsOptions) {
    const params: unknown[] = [options.datasetId, options.threshold];
    const search = options.searchQuery?.trim();
    const searchSql = search ? 'AND scores.tag_key LIKE ? COLLATE NOCASE' : '';
    if (search) params.push(likeQuery(search));
    params.push(options.limit);

    return this.db
      .prepare(
        `SELECT scores.tag_key AS autoTagKey,
                COUNT(*) AS predictionCount,
                COUNT(DISTINCT scores.asset_id) AS assetCount
         FROM auto_tag_prediction_scores scores
         JOIN assets a ON a.id = scores.asset_id
         JOIN stacks s ON s.id = a.stack_id
         WHERE s.dataset_id = ?
           AND scores.score >= ?
           ${searchSql}
         GROUP BY scores.tag_key
         ORDER BY predictionCount DESC, scores.tag_key ASC
         LIMIT ?`
      )
      .all(...params) as AutoTagStats[];
  }

  private getStatisticsFromAggregates(options: AutoTagStatisticsOptions) {
    const params: unknown[] = [options.datasetId, options.threshold];
    const search = options.searchQuery?.trim();
    const searchSql = search ? 'AND scores.tag_key LIKE ? COLLATE NOCASE' : '';
    if (search) params.push(likeQuery(search));
    params.push(options.limit);

    return this.db
      .prepare(
        `SELECT scores.tag_key AS autoTagKey,
                COUNT(*) AS predictionCount,
                COALESCE(SUM(scores.asset_count), 0) AS assetCount
         FROM stack_auto_tag_scores scores
         JOIN stacks s ON s.id = scores.stack_id
         WHERE s.dataset_id = ?
           AND scores.score >= ?
           ${searchSql}
         GROUP BY scores.tag_key
         ORDER BY predictionCount DESC, scores.tag_key ASC
         LIMIT ?`
      )
      .all(...params) as AutoTagStats[];
  }

  private countPredictions(datasetId: number) {
    return (
      (
        this.db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM auto_tag_predictions p
             JOIN assets a ON a.id = p.asset_id
             JOIN stacks s ON s.id = a.stack_id
             WHERE s.dataset_id = ?`
          )
          .get(datasetId) as CountRow | undefined
      )?.count ?? 0
    );
  }

  private hasTagConflict(datasetId: number, tagId: number, autoTagKey: string, mappingId?: number) {
    const params: unknown[] = [datasetId, tagId, autoTagKey];
    const mappingFilter = mappingId ? 'AND id <> ?' : '';
    if (mappingId) params.push(mappingId);
    const row = this.db
      .prepare(
        `SELECT id
         FROM auto_tag_mappings
         WHERE dataset_id = ?
           AND tag_id = ?
           AND auto_tag_key <> ? COLLATE NOCASE
           ${mappingFilter}
         LIMIT 1`
      )
      .get(...params);
    return Boolean(row);
  }

  private getMappingByKey(datasetId: number, autoTagKey: string) {
    const row = this.db
      .prepare(
        `SELECT m.*, t.title AS tag_title
         FROM auto_tag_mappings m
         LEFT JOIN tags t ON t.id = m.tag_id
         WHERE m.dataset_id = ? AND m.auto_tag_key = ? COLLATE NOCASE`
      )
      .get(datasetId, autoTagKey) as MappingRow | undefined;
    return row ? toMapping(row) : null;
  }

  private getMappingById(datasetId: number, mappingId: number) {
    const row = this.db
      .prepare(
        `SELECT m.*, t.title AS tag_title
         FROM auto_tag_mappings m
         LEFT JOIN tags t ON t.id = m.tag_id
         WHERE m.dataset_id = ? AND m.id = ?`
      )
      .get(datasetId, mappingId) as MappingRow | undefined;
    return row ? toMapping(row) : null;
  }

  private saveAssetPrediction(
    assetId: number,
    prediction: StandaloneTagPrediction,
    threshold: number
  ) {
    const now = nowIso();
    const scoreEntries = scoreEntriesFromPrediction(
      prediction.scores,
      prediction.predicted_tags,
      threshold
    );
    const tagCount =
      prediction.tag_count || prediction.predicted_tags.length || scoreEntries.length;

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO auto_tag_predictions
             (asset_id, tags_json, scores_json, threshold, tag_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(asset_id) DO UPDATE SET
             tags_json = excluded.tags_json,
             scores_json = excluded.scores_json,
             threshold = excluded.threshold,
             tag_count = excluded.tag_count,
             updated_at = excluded.updated_at`
        )
        .run(
          assetId,
          JSON.stringify(prediction.predicted_tags),
          JSON.stringify(prediction.scores),
          threshold,
          tagCount,
          now,
          now
        );

      const row = this.db
        .prepare('SELECT id FROM auto_tag_predictions WHERE asset_id = ?')
        .get(assetId) as PredictionIdRow | undefined;
      if (!row) throw new Error('AutoTag prediction upsert failed');

      this.db.prepare('DELETE FROM auto_tag_prediction_scores WHERE prediction_id = ?').run(row.id);
      const insertScore = this.db.prepare(
        `INSERT INTO auto_tag_prediction_scores
           (prediction_id, asset_id, tag_key, score, rank)
         VALUES (?, ?, ?, ?, ?)`
      );
      scoreEntries.forEach((entry, index) => {
        insertScore.run(row.id, assetId, entry.tagKey, entry.score, index + 1);
      });

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private async generateTagsWithRetry(fileKey: string, threshold: number) {
    const client = getAutoTagClient();
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await client.generateTags(fileKey, threshold);
      } catch (error) {
        if (!isAutoTagLoadingError(error) || attempt === maxAttempts) {
          throw error;
        }
        await wait(2000);
      }
    }
    throw new Error('AutoTag prediction failed');
  }

  private saveStackAggregate(
    stackId: number,
    aggregatedTags: Record<string, number>,
    topTags: Array<{ tag: string; score: number }>,
    assetCount: number,
    threshold: number
  ) {
    const now = nowIso();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO stack_auto_tag_aggregates
             (stack_id, aggregated_tags_json, top_tags_json, asset_count, threshold, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(stack_id) DO UPDATE SET
             aggregated_tags_json = excluded.aggregated_tags_json,
             top_tags_json = excluded.top_tags_json,
             asset_count = excluded.asset_count,
             threshold = excluded.threshold,
             updated_at = excluded.updated_at`
        )
        .run(
          stackId,
          JSON.stringify(aggregatedTags),
          JSON.stringify(topTags),
          assetCount,
          threshold,
          now,
          now
        );
      const aggregate = this.db
        .prepare('SELECT id FROM stack_auto_tag_aggregates WHERE stack_id = ?')
        .get(stackId) as { id: number } | undefined;
      if (!aggregate) throw new Error('Stack AutoTag aggregate upsert failed');

      this.db.prepare('DELETE FROM stack_auto_tag_scores WHERE aggregate_id = ?').run(aggregate.id);
      const insertScore = this.db.prepare(
        `INSERT INTO stack_auto_tag_scores
           (aggregate_id, stack_id, tag_key, score, rank, asset_count, threshold)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      topTags.forEach((tag, index) => {
        insertScore.run(
          aggregate.id,
          stackId,
          tag.tag,
          tag.score,
          index + 1,
          assetCount,
          threshold
        );
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
