import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AutoTagClient } from '../../lib/AutoTagClient';
import { StandaloneColorRepository } from '../../repositories/sqlite/color-repository';
import { StandaloneStackRepository } from '../../repositories/sqlite/stack-repository';
import type { DominantColor } from '../../utils/colorExtractor';
import {
  ImageStackSearchService,
  intersectScoredIdsWithEligible,
  UnsupportedImageError,
} from './ImageStackSearchService';

const schemaPath = resolve(process.cwd(), 'sqlite/schema.sql');
const now = '2026-06-20T00:00:00.000Z';

const redColor: DominantColor = {
  r: 255,
  g: 0,
  b: 0,
  hex: '#FF0000',
  percentage: 1,
  hue: 0,
  saturation: 100,
  lightness: 50,
  hueCategory: 'red',
};

const cyanColor: DominantColor = {
  r: 0,
  g: 255,
  b: 255,
  hex: '#00FFFF',
  percentage: 1,
  hue: 180,
  saturation: 100,
  lightness: 50,
  hueCategory: 'cyan',
};

const redQueryColorInput = { r: 255, g: 0, b: 0, hex: '#FF0000', percentage: 1 };

const fakeExtractQueryColors = async () => [redColor];

const makeAutoTagClient = (
  impl: (
    buffer: Buffer,
    filename: string,
    threshold?: number
  ) => Promise<{
    scores: Record<string, number>;
    predicted_tags: string[];
    tag_count: number;
    threshold: number;
  }>
): AutoTagClient => ({ generateTagsFromBuffer: impl }) as unknown as AutoTagClient;

describe('ImageStackSearchService', () => {
  let db: DatabaseSync;
  let stackRepository: StandaloneStackRepository;
  let colorRepository: StandaloneColorRepository;
  let nextAggregateId: number;

  const insertStack = (id: number, name: string, colors: DominantColor[] | null) => {
    db.prepare(
      `INSERT INTO stacks
         (id, dataset_id, name, thumbnail, category, dominant_colors_json, created_at, updated_at)
       VALUES (?, 1, ?, '', 'image', ?, ?, ?)`
    ).run(id, name, colors ? JSON.stringify(colors) : null, now, now);
  };

  const insertAutoTagScores = (stackId: number, tags: Array<{ tagKey: string; score: number }>) => {
    if (tags.length === 0) return;
    const aggregateId = nextAggregateId++;
    db.prepare(
      `INSERT INTO stack_auto_tag_aggregates
         (id, stack_id, aggregated_tags_json, top_tags_json, asset_count, threshold, created_at, updated_at)
       VALUES (?, ?, '[]', '[]', 1, 0.4, ?, ?)`
    ).run(aggregateId, stackId, now, now);

    const insert = db.prepare(
      `INSERT INTO stack_auto_tag_scores
         (aggregate_id, stack_id, tag_key, score, rank, asset_count, threshold)
       VALUES (?, ?, ?, ?, ?, 1, 0.4)`
    );
    tags.forEach((tag, index) => {
      insert.run(aggregateId, stackId, tag.tagKey, tag.score, index + 1);
    });
  };

  const insertAsset = (stackId: number, hash: string) => {
    db.prepare(
      `INSERT INTO assets
         (id, stack_id, file, thumbnail, file_type, original_name, hash, created_at, updated_at)
       VALUES (?, ?, ?, '', 'jpg', ?, ?, ?, ?)`
    ).run(stackId, stackId, `library/1/assets/${stackId}.jpg`, `${stackId}.jpg`, hash, now, now);
  };

  const insertFavorite = (stackId: number) => {
    db.prepare(
      `INSERT INTO stack_favorites (id, user_id, stack_id, created_at) VALUES (?, 1, ?, ?)`
    ).run(stackId, stackId, now);
  };

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(readFileSync(schemaPath, 'utf8'));
    stackRepository = new StandaloneStackRepository(db);
    colorRepository = new StandaloneColorRepository(db);
    nextAggregateId = 1;

    db.prepare(
      `INSERT INTO datasets (id, name, created_at, updated_at)
       VALUES (1, 'Library', ?, ?)`
    ).run(now, now);

    db.prepare(
      `INSERT INTO users (id, name, created_at, updated_at)
       VALUES (1, 'tester', ?, ?)`
    ).run(now, now);

    // tag-only-close: matches reference tags exactly, colors are opposite of the query
    insertStack(10, 'tag-only-close', [cyanColor]);
    insertAutoTagScores(10, [
      { tagKey: 'tag_a', score: 0.9 },
      { tagKey: 'tag_b', score: 0.8 },
    ]);

    // color-only-close: colors match the query exactly, tags only weakly overlap
    // (just enough to enter the tag-candidate pool)
    insertStack(11, 'color-only-close', [redColor]);
    insertAutoTagScores(11, [{ tagKey: 'tag_a', score: 0.56 }]);

    // both-close: matches both tags and colors
    insertStack(12, 'both-close', [redColor]);
    insertAutoTagScores(12, [
      { tagKey: 'tag_a', score: 0.9 },
      { tagKey: 'tag_b', score: 0.8 },
    ]);

    // unrelated: only a bare-minimum tag overlap, colors opposite of the query
    insertStack(13, 'unrelated', [cyanColor]);
    insertAutoTagScores(13, [{ tagKey: 'tag_a', score: 0.56 }]);

    // no-colors: has no dominant_colors_json at all, must be excluded from the
    // color-only fallback candidate set
    insertStack(14, 'no-colors', null);
  });

  afterEach(() => {
    db.close();
  });

  describe('getScoredStackIds', () => {
    const tags = [
      { key: 'tag_a', score: 0.9 },
      { key: 'tag_b', score: 0.8 },
    ];

    it('ranks stacks by a tagWeight-weighted combination of tag and color similarity', () => {
      const service = new ImageStackSearchService({ stackRepository, colorRepository });

      const tagWeighted = service.getScoredStackIds(1, {
        tags,
        colors: [redQueryColorInput],
        tagWeight: 1,
      });
      expect(new Set(tagWeighted.slice(0, 2).map((s) => s.id))).toEqual(new Set([10, 12]));

      const colorWeighted = service.getScoredStackIds(1, {
        tags,
        colors: [redQueryColorInput],
        tagWeight: 0,
      });
      expect(new Set(colorWeighted.slice(0, 2).map((s) => s.id))).toEqual(new Set([11, 12]));

      const balanced = service.getScoredStackIds(1, {
        tags,
        colors: [redQueryColorInput],
        tagWeight: 0.65,
      });
      expect(balanced[0]?.id).toBe(12);
    });

    it('falls back to color-only scoring across all stacks with colors when tags is empty', () => {
      const service = new ImageStackSearchService({ stackRepository, colorRepository });

      const result = service.getScoredStackIds(1, {
        tags: [],
        colors: [redQueryColorInput],
        tagWeight: 0.65,
      });

      // no-colors (14) must never appear: it has no dominant_colors_json
      expect(result.map((entry) => entry.id)).not.toContain(14);
      // full unsorted-by-limit array: all 4 stacks-with-colors are present, not just top N
      expect(result).toHaveLength(4);
      expect(new Set(result.map((entry) => entry.id))).toEqual(new Set([10, 11, 12, 13]));

      // sorted desc by score, color-only-close and both-close (exact red match) first
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
      }
      expect(new Set(result.slice(0, 2).map((s) => s.id))).toEqual(new Set([11, 12]));
    });

    it('filters out stacks below the score threshold', () => {
      const service = new ImageStackSearchService({ stackRepository, colorRepository });

      const full = service.getScoredStackIds(1, {
        tags,
        colors: [redQueryColorInput],
        tagWeight: 0.65,
      });
      // sorted desc, so full[0] is max and full[full.length - 1] is min
      expect(full[0].score).not.toBe(full[full.length - 1].score);

      const threshold = (full[0].score + full[full.length - 1].score) / 2;
      const filtered = service.getScoredStackIds(1, {
        tags,
        colors: [redQueryColorInput],
        tagWeight: 0.65,
        threshold,
      });

      expect(filtered.length).toBeLessThan(full.length);
      expect(filtered.length).toBeGreaterThan(0);
      for (const entry of filtered) {
        expect(entry.score).toBeGreaterThanOrEqual(threshold);
      }
      expect(new Set(filtered.map((e) => e.id))).toEqual(
        new Set(full.filter((e) => e.score >= threshold).map((e) => e.id))
      );
    });

    it('returns everything unchanged when threshold is 0 or omitted', () => {
      const service = new ImageStackSearchService({ stackRepository, colorRepository });

      const withoutThreshold = service.getScoredStackIds(1, {
        tags,
        colors: [redQueryColorInput],
        tagWeight: 0.65,
      });
      const withZeroThreshold = service.getScoredStackIds(1, {
        tags,
        colors: [redQueryColorInput],
        tagWeight: 0.65,
        threshold: 0,
      });

      expect(withZeroThreshold).toEqual(withoutThreshold);
    });

    it('places an exact content-hash match first even when it has no searchable tags', () => {
      const contentHash = 'a'.repeat(64);
      insertAsset(14, contentHash);
      const service = new ImageStackSearchService({ stackRepository, colorRepository });

      const result = service.getScoredStackIds(1, {
        contentHash,
        tags,
        colors: [redQueryColorInput],
        tagWeight: 0.65,
      });

      expect(result[0]).toEqual({ id: 14, score: 1 });
    });
  });

  describe('analyzeImage', () => {
    it('builds the query tag list only from valid (non-stop, above-threshold) tags', async () => {
      const autoTagClient = makeAutoTagClient(async () => ({
        scores: {
          '1girl': 0.99, // stop tag, must be excluded
          weak_tag: 0.3, // below SIMILAR_CONFIG.autoMinScore, must be excluded
          valid_tag: 0.7,
        },
        predicted_tags: ['1girl', 'weak_tag', 'valid_tag'],
        tag_count: 3,
        threshold: 0.4,
      }));

      const service = new ImageStackSearchService({
        stackRepository,
        colorRepository,
        autoTagClient,
        extractQueryColors: fakeExtractQueryColors,
      });

      const result = await service.analyzeImage({ buffer: Buffer.from(''), filename: 'query.png' });

      expect(result.contentHash).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
      expect(result.autoTagAvailable).toBe(true);
      expect(result.tags).toEqual([{ key: 'valid_tag', score: 0.7 }]);
      expect(result.colors).toEqual([{ r: 255, g: 0, b: 0, hex: '#FF0000', percentage: 1 }]);
    });

    it('returns autoTagAvailable:false with empty tags when the autoTagClient throws, keeping colors', async () => {
      const autoTagClient = makeAutoTagClient(async () => {
        throw new Error('JoyTag server unreachable');
      });

      const service = new ImageStackSearchService({
        stackRepository,
        colorRepository,
        autoTagClient,
        extractQueryColors: fakeExtractQueryColors,
      });

      const result = await service.analyzeImage({ buffer: Buffer.from(''), filename: 'query.png' });

      expect(result.contentHash).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
      expect(result.autoTagAvailable).toBe(false);
      expect(result.tags).toEqual([]);
      expect(result.colors).toEqual([{ r: 255, g: 0, b: 0, hex: '#FF0000', percentage: 1 }]);
    });

    it('rejects with UnsupportedImageError when color extraction fails', async () => {
      const autoTagClient = makeAutoTagClient(async () => ({
        scores: {},
        predicted_tags: [],
        tag_count: 0,
        threshold: 0.4,
      }));
      const service = new ImageStackSearchService({
        stackRepository,
        colorRepository,
        autoTagClient,
        extractQueryColors: async () => {
          throw new Error('cannot decode');
        },
      });

      await expect(
        service.analyzeImage({ buffer: Buffer.from(''), filename: 'query.png' })
      ).rejects.toBeInstanceOf(UnsupportedImageError);
      await expect(
        service.analyzeImage({ buffer: Buffer.from(''), filename: 'query.png' })
      ).rejects.toThrow('cannot decode');
    });
  });

  describe('intersectScoredIdsWithEligible', () => {
    it('preserves score order, reports the filtered total, and pages with offset/limit', () => {
      const scored = [
        { id: 1, score: 0.9 },
        { id: 2, score: 0.8 },
        { id: 3, score: 0.7 },
        { id: 4, score: 0.6 },
      ];
      const eligibleIds = new Set([2, 4]);

      const page1 = intersectScoredIdsWithEligible(scored, eligibleIds, 1, 0);
      expect(page1).toEqual({ ids: [2], total: 2 });

      const page2 = intersectScoredIdsWithEligible(scored, eligibleIds, 1, 1);
      expect(page2).toEqual({ ids: [4], total: 2 });

      const all = intersectScoredIdsWithEligible(scored, eligibleIds, 10, 0);
      expect(all).toEqual({ ids: [2, 4], total: 2 });
    });
  });

  describe('imageSearch combined with other filters (route-branch composition)', () => {
    it('intersects score-ordered ids with getMatchingStackIds so only the favorited stack survives', () => {
      insertFavorite(12);

      const service = new ImageStackSearchService({ stackRepository, colorRepository });
      const scored = service.getScoredStackIds(1, {
        tags: [
          { key: 'tag_a', score: 0.9 },
          { key: 'tag_b', score: 0.8 },
        ],
        colors: [redQueryColorInput],
        tagWeight: 0.65,
      });

      const eligibleIds = new Set(stackRepository.getMatchingStackIds({ dataSetId: 1, fav: '1' }));

      const { ids, total } = intersectScoredIdsWithEligible(scored, eligibleIds, 50, 0);

      expect(total).toBe(1);
      expect(ids).toEqual([12]);
    });

    it('intersects score-ordered ids with the color filter so only color-matched stacks survive', () => {
      const service = new ImageStackSearchService({ stackRepository, colorRepository });
      const scored = service.getScoredStackIds(1, {
        tags: [
          { key: 'tag_a', score: 0.9 },
          { key: 'tag_b', score: 0.8 },
        ],
        colors: [redQueryColorInput],
        tagWeight: 0.65,
      });

      // /stacks/paginated と同じ合成経路: 色フィルタで得た stackIds を
      // getMatchingStackIds に渡して他フィルタと積集合し、それを eligible にする
      const colorIds = colorRepository.getMatchingStackIdsByFilter({
        dataSetId: 1,
        hueCategories: ['red'],
      });
      expect(new Set(colorIds)).toEqual(new Set([11, 12]));

      const eligibleIds = new Set(
        stackRepository.getMatchingStackIds({ dataSetId: 1, stackIds: colorIds })
      );

      const { ids, total } = intersectScoredIdsWithEligible(scored, eligibleIds, 50, 0);

      expect(total).toBe(2);
      // 色マッチした 11, 12 のみが、スコア降順(both-close の 12 が先)で残る
      expect(ids).toEqual([12, 11]);
    });
  });
});
