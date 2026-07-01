import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path, { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataStorage } from '../../lib/DataStorage';
import { StandaloneStackRepository } from './stack-repository';

const schemaPath = resolve(process.cwd(), 'sqlite/schema.sql');
const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');

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
         (1, 1, '/tmp/landscape.png', '', 'png', 'landscape.png', 'hash-1', 0, ?, ?),
         (2, 2, '/tmp/portrait-1.png', '', 'png', 'portrait-1.png', 'hash-2', 0, ?, ?),
         (3, 2, '/tmp/portrait-2.jpg', '', 'jpg', 'portrait-2.jpg', 'hash-3', 1, ?, ?),
         (4, 3, '/tmp/motion.mp4', '', 'mp4', 'motion.mp4', 'hash-4', 0, ?, ?)`
    ).run(now, now, now, now, now, now, now, now);
    repository.refreshActualMediaTypesForDataset(1);
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
      mediaTypes: ['image'],
      limit: 50,
      offset: 0,
    });
    const multipleImages = repository.getPaginated({
      dataSetId: 1,
      mediaTypes: ['multipleImages'],
      limit: 50,
      offset: 0,
    });
    const imageLike = repository.getPaginated({
      dataSetId: 1,
      mediaTypes: ['image', 'multipleImages'],
      limit: 50,
      offset: 0,
    });
    const categoryVideo = repository.getPaginated({
      dataSetId: 1,
      mediaCategory: 'comic',
      mediaTypes: ['video'],
      limit: 50,
      offset: 0,
    });

    expect(singleImage.stacks.map((stack) => [stack.id, stack.actualMediaType])).toEqual([
      [1, 'image'],
    ]);
    expect(multipleImages.stacks.map((stack) => [stack.id, stack.actualMediaType])).toEqual([
      [2, 'multipleImages'],
    ]);
    expect(imageLike.stacks.map((stack) => [stack.id, stack.actualMediaType])).toEqual([
      [2, 'multipleImages'],
      [1, 'image'],
    ]);
    expect(categoryVideo.stacks.map((stack) => [stack.id, stack.mediaType])).toEqual([
      [3, 'comic'],
    ]);
    expect(categoryVideo.stacks.map((stack) => [stack.id, stack.actualMediaType])).toEqual([
      [3, 'video'],
    ]);
  });

  it('merges source stack assets in the provided source id order', () => {
    const merged = repository.mergeStacks(1, [3, 2]);
    expect(merged?.id).toBe(1);

    const assets = db
      .prepare(
        `SELECT original_name, order_in_stack
         FROM assets
         WHERE stack_id = ?
         ORDER BY order_in_stack ASC`
      )
      .all(1) as Array<{ original_name: string; order_in_stack: number }>;

    expect(assets.map((asset) => asset.original_name)).toEqual([
      'landscape.png',
      'motion.mp4',
      'portrait-1.png',
      'portrait-2.jpg',
    ]);
    expect(assets.map((asset) => asset.order_in_stack)).toEqual([0, 1, 2, 3]);
  });

  it('refreshes actual media types for a dataset', () => {
    db.prepare('UPDATE stacks SET actual_media_type = NULL').run();

    const refreshResult = repository.refreshActualMediaTypesForDataset(1);
    const result = repository.getPaginated({
      dataSetId: 1,
      mediaTypes: ['image', 'multipleImages', 'video'],
      limit: 50,
      offset: 0,
    });

    expect(refreshResult).toEqual({ updated: 3, total: 3 });
    expect(result.stacks.map((stack) => [stack.id, stack.actualMediaType])).toEqual([
      [3, 'video'],
      [2, 'multipleImages'],
      [1, 'image'],
    ]);
  });

  it('refreshes actual media type after asset changes', () => {
    const before = repository.getById(2, 1);
    expect(before?.actualMediaType).toBe('multipleImages');

    expect(repository.deleteAsset(3)).toBe(true);

    const after = repository.getById(2, 1);
    expect(after?.actualMediaType).toBe('image');

    const multipleImages = repository.getPaginated({
      dataSetId: 1,
      mediaTypes: ['multipleImages'],
      limit: 50,
      offset: 0,
    });
    expect(multipleImages.stacks.map((stack) => stack.id)).toEqual([]);
  });

  it('keeps the selected asset as stack thumbnail during refresh', async () => {
    const previousStorage = process.env.FILES_STORAGE;
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-selected-thumbnail-'));
    process.env.FILES_STORAGE = tempDir;

    const firstThumbnail = 'library/1/thumbnails/aa/first.jpg';
    const secondThumbnail = 'library/1/thumbnails/bb/second.jpg';
    for (const thumbnail of [firstThumbnail, secondThumbnail]) {
      const thumbnailPath = DataStorage.getPath(thumbnail);
      mkdirSync(path.dirname(thumbnailPath), { recursive: true });
      writeFileSync(thumbnailPath, '');
    }

    db.prepare('UPDATE assets SET thumbnail = ? WHERE id = 2').run(firstThumbnail);
    db.prepare('UPDATE assets SET thumbnail = ? WHERE id = 3').run(secondThumbnail);
    db.prepare('UPDATE stacks SET thumbnail = ? WHERE id = 2').run(firstThumbnail);

    try {
      const setResult = await repository.setStackThumbnailSource(2, {
        assetId: 3,
        pageNumber: 2,
      });
      db.prepare('UPDATE stacks SET thumbnail = ? WHERE id = 2').run(firstThumbnail);

      const refreshResult = await repository.refreshStackThumbnail(2, { force: false });
      const stack = db.prepare('SELECT thumbnail, meta_json FROM stacks WHERE id = 2').get() as
        | { thumbnail: string; meta_json: string | null }
        | undefined;
      const fetched = repository.getById(2, 1);
      const meta = stack?.meta_json ? JSON.parse(stack.meta_json) : {};

      expect(setResult?.thumbnail).toBe(secondThumbnail);
      expect(refreshResult?.success).toBe(true);
      expect(stack?.thumbnail).toBe(secondThumbnail);
      expect(fetched?.thumbnail).toBe(`/files/${secondThumbnail}`);
      expect(meta.thumbnailSource).toEqual({
        kind: 'asset',
        assetId: 3,
        pageNumber: 2,
      });
    } finally {
      if (previousStorage === undefined) {
        delete process.env.FILES_STORAGE;
      } else {
        process.env.FILES_STORAGE = previousStorage;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('regenerates missing asset thumbnails during stack thumbnail refresh', async () => {
    const previousStorage = process.env.FILES_STORAGE;
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-stack-thumbnail-'));
    process.env.FILES_STORAGE = tempDir;

    const fileKey = 'library/1/assets/ab/source.svg';
    const inputPath = DataStorage.getPath(fileKey);
    mkdirSync(path.dirname(inputPath), { recursive: true });
    writeFileSync(
      inputPath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#fff"/><circle cx="32" cy="32" r="20" fill="#222"/></svg>'
    );
    db.prepare(
      `UPDATE assets
       SET file = ?, thumbnail = '', file_type = 'svg'
       WHERE id = 1`
    ).run(fileKey);

    try {
      const refreshResult = await repository.refreshStackThumbnail(1, { force: false });
      const asset = db.prepare('SELECT thumbnail FROM assets WHERE id = 1').get() as
        | { thumbnail: string }
        | undefined;
      const stack = db.prepare('SELECT thumbnail FROM stacks WHERE id = 1').get() as
        | { thumbnail: string }
        | undefined;

      expect(refreshResult?.success).toBe(true);
      expect(refreshResult?.regenerated).toBe(1);
      expect(asset?.thumbnail).toMatch(/^library\/1\/thumbnails\/[a-f0-9]{2}\//);
      expect(stack?.thumbnail).toBe(asset?.thumbnail);
      expect(asset?.thumbnail ? existsSync(DataStorage.getPath(asset.thumbnail)) : false).toBe(
        true
      );
    } finally {
      if (previousStorage === undefined) {
        delete process.env.FILES_STORAGE;
      } else {
        process.env.FILES_STORAGE = previousStorage;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects a duplicated PDF source before rasterizing pages', async () => {
    const now = '2026-06-20T00:00:00.000Z';
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-pdf-duplicate-'));
    const pdfContent = '%PDF-1.7\nsame document\n';
    const sourceHash = sha256(pdfContent);
    const filePath = path.join(tempDir, 'same.pdf');
    writeFileSync(filePath, pdfContent);
    db.prepare(
      `INSERT INTO assets
         (id, stack_id, file, thumbnail, file_type, original_name, hash, order_in_stack, meta_json, created_at, updated_at)
       VALUES
         (5, 1, '/tmp/pdf-page-1.jpg', '', 'jpg', 'same-p001.jpg', 'pdf-page-hash-1', 1, ?, ?, ?)`
    ).run(JSON.stringify({ sourcePdfHash: sourceHash, sourcePdfPage: 1 }), now, now);

    try {
      await expect(
        repository.addAssetWithFile(2, {
          path: filePath,
          originalname: 'same.pdf',
          mimetype: 'application/pdf',
          size: pdfContent.length,
        })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_ASSET',
        details: { stackId: 1, scope: 'dataset' },
      });
      expect(existsSync(filePath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects a duplicated AI source through the PDF-compatible import path', async () => {
    const now = '2026-06-20T00:00:00.000Z';
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-ai-duplicate-'));
    const aiContent = '%PDF-1.7\nsame artwork\n';
    const sourceHash = sha256(aiContent);
    const filePath = path.join(tempDir, 'same.ai');
    writeFileSync(filePath, aiContent);
    db.prepare(
      `INSERT INTO assets
         (id, stack_id, file, thumbnail, file_type, original_name, hash, order_in_stack, meta_json, created_at, updated_at)
       VALUES
         (5, 1, '/tmp/ai-page-1.jpg', '', 'jpg', 'same-p001.jpg', 'ai-page-hash-1', 1, ?, ?, ?)`
    ).run(JSON.stringify({ sourcePdfHash: sourceHash, sourcePdfPage: 1 }), now, now);

    try {
      await expect(
        repository.addAssetWithFile(2, {
          path: filePath,
          originalname: 'same.ai',
          mimetype: 'application/postscript',
          size: aiContent.length,
        })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_ASSET',
        details: { stackId: 1, scope: 'dataset' },
      });
      expect(existsSync(filePath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects a duplicated SVG through the normal asset hash path', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-svg-duplicate-'));
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>';
    const sourceHash = sha256(svgContent);
    const filePath = path.join(tempDir, 'same.svg');
    writeFileSync(filePath, svgContent);
    db.prepare('UPDATE assets SET file_type = ?, original_name = ?, hash = ? WHERE id = 1').run(
      'svg',
      'same.svg',
      sourceHash
    );

    try {
      await expect(
        repository.addAssetWithFile(2, {
          path: filePath,
          originalname: 'same.svg',
          mimetype: 'image/svg+xml',
          size: svgContent.length,
        })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_ASSET',
        details: { stackId: 1, scope: 'dataset' },
      });
      expect(existsSync(filePath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
