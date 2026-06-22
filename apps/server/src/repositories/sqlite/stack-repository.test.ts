import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StandaloneStackRepository } from './stack-repository';

const schemaPath = resolve(process.cwd(), 'sqlite/schema.sql');

describe('StandaloneStackRepository search', () => {
  let db: DatabaseSync;
  let repository: StandaloneStackRepository;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(readFileSync(schemaPath, 'utf8'));
    repository = new StandaloneStackRepository(db);

    const now = '2026-06-20T00:00:00.000Z';
    db.prepare(
      `INSERT INTO datasets (id, name, created_at, updated_at)
       VALUES (1, 'Library', ?, ?)`
    ).run(now, now);
    db.prepare(
      `INSERT INTO stacks (id, dataset_id, name, thumbnail, media_type, created_at, updated_at)
       VALUES
         (1, 1, 'Landscape Reference', '', 'image', ?, ?),
         (2, 1, 'Portrait Reference', '', 'image', ?, ?),
         (3, 1, 'Motion Reference', '', 'comic', ?, ?)`
    ).run(now, now, now, now, now, now);
    db.prepare(
      `INSERT INTO assets
         (id, stack_id, file, thumbnail, file_type, original_name, hash, order_in_stack, created_at, updated_at)
       VALUES
         (1, 1, '/tmp/landscape.png', '', 'image/png', 'landscape.png', 'hash-1', 0, ?, ?),
         (2, 2, '/tmp/portrait-1.png', '', 'image/png', 'portrait-1.png', 'hash-2', 0, ?, ?),
         (3, 2, '/tmp/portrait-2.jpg', '', 'image/jpeg', 'portrait-2.jpg', 'hash-3', 1, ?, ?),
         (4, 3, '/tmp/motion.mp4', '', 'video/mp4', 'motion.mp4', 'hash-4', 0, ?, ?)`
    ).run(now, now, now, now, now, now, now, now);
    db.prepare(
      `INSERT INTO stack_auto_tag_aggregates
         (id, stack_id, aggregated_tags_json, top_tags_json, asset_count, threshold, created_at, updated_at)
       VALUES
         (1, 1, '[]', '[{"tag":"blue_sky","score":0.92}]', 1, 0.4, ?, ?),
         (2, 2, '[]', '[{"tag":"low_score_tag","score":0.2}]', 1, 0.4, ?, ?)`
    ).run(now, now, now, now);
    db.prepare(
      `INSERT INTO stack_auto_tag_scores
         (aggregate_id, stack_id, tag_key, score, rank, asset_count, threshold)
       VALUES
         (1, 1, 'blue_sky', 0.92, 1, 1, 0.4),
         (2, 2, 'low_score_tag', 0.2, 1, 1, 0.4)`
    ).run();
    db.prepare(
      `INSERT INTO auto_tag_mappings
         (id, dataset_id, auto_tag_key, display_name, is_active, created_at, updated_at)
       VALUES (1, 1, 'blue_sky', '青空', 1, ?, ?)`
    ).run(now, now);
  });

  afterEach(() => {
    db.close();
  });

  it('matches stacks by auto tag key', () => {
    const result = repository.getPaginated({
      dataSetId: 1,
      search: 'blue',
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.stacks.map((stack) => stack.id)).toEqual([1]);
  });

  it('matches stacks by auto tag display name', () => {
    const result = repository.getPaginated({
      dataSetId: 1,
      search: '青空',
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.stacks.map((stack) => stack.id)).toEqual([1]);
  });

  it('ignores auto tag scores below the search threshold', () => {
    const result = repository.getPaginated({
      dataSetId: 1,
      search: 'low_score',
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(0);
  });

  it('filters by actual media type independently from media category', () => {
    const singleImage = repository.getPaginated({
      dataSetId: 1,
      mediaType: 'image',
      limit: 50,
      offset: 0,
    });
    const multipleImages = repository.getPaginated({
      dataSetId: 1,
      mediaType: 'multipleImages',
      limit: 50,
      offset: 0,
    });
    const categoryVideo = repository.getPaginated({
      dataSetId: 1,
      mediaCategory: 'comic',
      mediaType: 'video',
      limit: 50,
      offset: 0,
    });

    expect(singleImage.stacks.map((stack) => [stack.id, stack.actualMediaType])).toEqual([
      [1, 'image'],
    ]);
    expect(multipleImages.stacks.map((stack) => [stack.id, stack.actualMediaType])).toEqual([
      [2, 'multipleImages'],
    ]);
    expect(categoryVideo.stacks.map((stack) => [stack.id, stack.mediaType])).toEqual([
      [3, 'comic'],
    ]);
    expect(categoryVideo.stacks.map((stack) => [stack.id, stack.actualMediaType])).toEqual([
      [3, 'video'],
    ]);
  });
});
