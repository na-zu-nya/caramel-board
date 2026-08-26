import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StandaloneStackRepository } from '../stack-repository';
import { SIMILAR_CONFIG } from './helpers';
import { StackSimilarService } from './similar-service';
import type { SimilarVectors } from './types';

const schemaPath = resolve(process.cwd(), 'sqlite/schema.sql');
const now = '2026-06-20T00:00:00.000Z';

describe('StackSimilarService.getScoredSimilarByReference', () => {
  let db: DatabaseSync;
  let service: StackSimilarService;
  let nextAggregateId: number;

  const insertStack = (id: number) => {
    db.prepare(
      `INSERT INTO stacks (id, dataset_id, name, thumbnail, category, created_at, updated_at)
       VALUES (?, 1, ?, '', 'image', ?, ?)`
    ).run(id, `Stack ${id}`, now, now);
  };

  const insertAutoTagScores = (stackId: number, tags: Array<{ tagKey: string; score: number }>) => {
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

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(readFileSync(schemaPath, 'utf8'));
    service = new StackSimilarService(db);
    nextAggregateId = 1;

    db.prepare(
      `INSERT INTO datasets (id, name, created_at, updated_at)
       VALUES (1, 'Library', ?, ?)`
    ).run(now, now);
  });

  afterEach(() => {
    db.close();
  });

  it('excludes stop tags from candidate auto tag vectors', () => {
    insertStack(100);
    insertAutoTagScores(100, [
      { tagKey: 'blue_sky', score: 0.9 },
      { tagKey: '1girl', score: 0.99 }, // stop tag, must not affect scoring
    ]);

    const reference: SimilarVectors = {
      auto: new Map([['blue_sky', 0.9]]),
      manual: new Set(),
    };

    const result = service.getScoredSimilarByReference(1, reference, {});

    // If the stop tag leaked into the candidate vector it would inflate the
    // denominator (union term with no reference counterpart) and the score
    // would drop below 1. An exact match on the sole non-stop tag => score 1.
    expect(result).toEqual([{ id: 100, score: 1 }]);
  });

  it('excludes candidates whose only matching tag is below SIMILAR_CONFIG.autoMinScore', () => {
    insertStack(200); // below threshold
    insertAutoTagScores(200, [{ tagKey: 'common_tag', score: SIMILAR_CONFIG.autoMinScore - 0.1 }]);
    insertStack(201); // above threshold
    insertAutoTagScores(201, [{ tagKey: 'common_tag', score: SIMILAR_CONFIG.autoMinScore + 0.1 }]);

    const reference: SimilarVectors = {
      auto: new Map([['common_tag', 0.9]]),
      manual: new Set(),
    };

    const result = service.getScoredSimilarByReference(1, reference, {});
    const ids = result.map((entry) => entry.id);

    expect(ids).toContain(201);
    expect(ids).not.toContain(200);
  });

  it('truncates candidate auto tag vectors to SIMILAR_CONFIG.autoTopN entries by score', () => {
    insertStack(300);
    const junkTags = Array.from({ length: SIMILAR_CONFIG.autoTopN }, (_, index) => ({
      tagKey: `junk_${index}`,
      score: 0.9,
    }));
    // 'shared_tag' scores lower than every junk tag, so once ranked by score
    // desc it falls past the autoTopN cutoff and is dropped from the vector.
    insertAutoTagScores(300, [
      ...junkTags,
      { tagKey: 'shared_tag', score: SIMILAR_CONFIG.autoMinScore + 0.01 },
    ]);

    const reference: SimilarVectors = {
      auto: new Map([['shared_tag', 0.9]]),
      manual: new Set(),
    };

    const result = service.getScoredSimilarByReference(1, reference, {});

    // Candidate is found via the probe query (shared_tag matches, is above
    // autoMinScore) but its scored vector no longer contains shared_tag once
    // truncated, so the final Jaccard-style score collapses to 0 and is
    // filtered out entirely.
    expect(result.some((entry) => entry.id === 300)).toBe(false);
  });

  it('excludes ids passed as excludedStackIds', () => {
    insertStack(400);
    insertAutoTagScores(400, [{ tagKey: 'blue_sky', score: 0.9 }]);

    const reference: SimilarVectors = {
      auto: new Map([['blue_sky', 0.9]]),
      manual: new Set(),
    };

    const withoutExclusion = service.getScoredSimilarByReference(1, reference, {});
    expect(withoutExclusion.map((entry) => entry.id)).toContain(400);

    const withExclusion = service.getScoredSimilarByReference(1, reference, {
      excludedStackIds: [400],
    });
    expect(withExclusion.map((entry) => entry.id)).not.toContain(400);
  });

  it('keeps manual-tag-only candidates in the ranked candidate search', () => {
    insertStack(500);
    db.prepare('INSERT INTO tags (id, dataset_id, title) VALUES (1, 1, ?)').run('rare_manual');
    db.prepare('INSERT INTO stack_tags (stack_id, tag_id) VALUES (500, 1)').run();

    const reference: SimilarVectors = {
      auto: new Map(),
      manual: new Set(['rare_manual']),
    };

    expect(service.getScoredSimilarByReference(1, reference, {})).toEqual([{ id: 500, score: 1 }]);
  });

  it('ranks candidates by all shared tags before applying the candidate limit', () => {
    db.exec('BEGIN');
    try {
      for (let index = 0; index < SIMILAR_CONFIG.candidateLimit; index += 1) {
        const stackId = 1_000 + index;
        insertStack(stackId);
        insertAutoTagScores(stackId, [{ tagKey: 'common_tag', score: 0.9 }]);
      }
      insertStack(9_999);
      insertAutoTagScores(9_999, [
        { tagKey: 'common_tag', score: 0.9 },
        { tagKey: 'rare_tag', score: 0.6 },
      ]);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const reference: SimilarVectors = {
      auto: new Map([
        ['common_tag', 0.9],
        ['rare_tag', 0.6],
      ]),
      manual: new Set(),
    };

    const result = service.getScoredSimilarByReference(1, reference, {});

    expect(result[0]?.id).toBe(9_999);
  });
});

describe('StandaloneStackRepository.getSimilarByStackIds regression', () => {
  let db: DatabaseSync;
  let repository: StandaloneStackRepository;
  let nextAggregateId: number;

  const insertStack = (id: number, name: string) => {
    db.prepare(
      `INSERT INTO stacks (id, dataset_id, name, thumbnail, category, created_at, updated_at)
       VALUES (?, 1, ?, '', 'image', ?, ?)`
    ).run(id, name, now, now);
  };

  const insertAutoTagScores = (stackId: number, tags: Array<{ tagKey: string; score: number }>) => {
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

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(readFileSync(schemaPath, 'utf8'));
    repository = new StandaloneStackRepository(db);
    nextAggregateId = 1;

    db.prepare(
      `INSERT INTO datasets (id, name, created_at, updated_at)
       VALUES (1, 'Library', ?, ?)`
    ).run(now, now);

    insertStack(1, 'Source');
    insertAutoTagScores(1, [
      { tagKey: 'blue_sky', score: 0.9 },
      { tagKey: 'sunset', score: 0.8 },
    ]);

    insertStack(2, 'Close match'); // overlaps both tags closely
    insertAutoTagScores(2, [
      { tagKey: 'blue_sky', score: 0.9 },
      { tagKey: 'sunset', score: 0.8 },
    ]);

    insertStack(3, 'Partial match'); // overlaps only one tag
    insertAutoTagScores(3, [{ tagKey: 'blue_sky', score: 0.9 }]);
  });

  afterEach(() => {
    db.close();
  });

  it('returns {stacks, total, limit, offset} shape with results ranked by similarity', () => {
    const result = repository.getSimilarByStackIds(1, [1], { limit: 10, offset: 0 });

    expect(result).toHaveProperty('stacks');
    expect(result).toHaveProperty('total');
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(0);
    expect(result.stacks.map((stack) => stack.id)).toEqual([2, 3]);
    expect(result.total).toBe(2);
  });
});
