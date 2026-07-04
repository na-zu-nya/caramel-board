import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path, { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataStorage } from '../../lib/DataStorage';
import { backfillAssetDimensionsTask } from './backfill-asset-dimensions';

const schemaPath = resolve(process.cwd(), 'sqlite/schema.sql');
const NOW = '2026-06-20T00:00:00.000Z';

describe('backfillAssetDimensionsTask', () => {
  let db: DatabaseSync;
  let tempDir: string;
  let previousStorage: string | undefined;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(readFileSync(schemaPath, 'utf8'));
    db.prepare(
      `INSERT INTO datasets (id, name, created_at, updated_at) VALUES (1, 'Library', ?, ?)`
    ).run(NOW, NOW);
    db.prepare(
      `INSERT INTO stacks (id, dataset_id, name, thumbnail, category, created_at, updated_at)
       VALUES (1, 1, 'Stack', '', 'image', ?, ?)`
    ).run(NOW, NOW);

    previousStorage = process.env.FILES_STORAGE;
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-maintenance-'));
    process.env.FILES_STORAGE = tempDir;
  });

  afterEach(() => {
    db.close();
    if (previousStorage === undefined) {
      delete process.env.FILES_STORAGE;
    } else {
      process.env.FILES_STORAGE = previousStorage;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  const insertAsset = (
    id: number,
    fileKey: string,
    fileType: string,
    width: number | null = null,
    height: number | null = null
  ) => {
    db.prepare(
      `INSERT INTO assets
         (id, stack_id, file, thumbnail, file_type, original_name, hash, width, height, order_in_stack, created_at, updated_at)
       VALUES (?, 1, ?, '', ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(id, fileKey, fileType, `${fileKey}-name`, `hash-${id}`, width, height, NOW, NOW);
  };

  it('fills in missing width/height for a readable image asset', async () => {
    const fileKey = 'library/1/assets/aa/photo.png';
    const filePath = DataStorage.getPath(fileKey);
    mkdirSync(path.dirname(filePath), { recursive: true });
    await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toFile(filePath);

    insertAsset(1, fileKey, 'png');
    expect(backfillAssetDimensionsTask.countPending(db)).toBe(1);

    const progressCalls: Array<[number, number]> = [];
    const result = await backfillAssetDimensionsTask.run({
      db,
      reportProgress: (processed, total) => progressCalls.push([processed, total]),
    });

    expect(result).toEqual({ processed: 1, total: 1, failed: 0 });
    const row = db.prepare('SELECT width, height FROM assets WHERE id = 1').get() as {
      width: number;
      height: number;
    };
    expect(row.width).toBe(40);
    expect(row.height).toBe(30);
    expect(backfillAssetDimensionsTask.countPending(db)).toBe(0);
    expect(progressCalls.at(-1)).toEqual([1, 1]);
  });

  it('counts an unreadable image as failed and leaves its dimensions null', async () => {
    const fileKey = 'library/1/assets/bb/broken.png';
    const filePath = DataStorage.getPath(fileKey);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, 'not-a-real-image');

    insertAsset(2, fileKey, 'png');

    const result = await backfillAssetDimensionsTask.run({ db, reportProgress: () => {} });

    expect(result).toEqual({ processed: 1, total: 1, failed: 1 });
    const row = db.prepare('SELECT width, height FROM assets WHERE id = 2').get() as {
      width: number | null;
      height: number | null;
    };
    expect(row.width).toBeNull();
    expect(row.height).toBeNull();
  });

  it('excludes video assets from the pending set', async () => {
    insertAsset(3, 'library/1/assets/cc/movie.mp4', 'mp4');

    expect(backfillAssetDimensionsTask.countPending(db)).toBe(0);
    const result = await backfillAssetDimensionsTask.run({ db, reportProgress: () => {} });
    expect(result).toEqual({ processed: 0, total: 0, failed: 0 });
  });

  it('ignores assets that already have dimensions', () => {
    insertAsset(4, 'library/1/assets/dd/done.png', 'png', 100, 200);
    expect(backfillAssetDimensionsTask.countPending(db)).toBe(0);
  });
});
