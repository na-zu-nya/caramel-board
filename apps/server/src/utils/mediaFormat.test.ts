import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureMediaExtension, resolveMediaExtension } from './mediaFormat';

describe('mediaFormat', () => {
  const tempDirectories: string[] = [];

  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  const createTempPath = (name: string) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'caramel-media-format-'));
    tempDirectories.push(directory);
    return path.join(directory, name);
  };

  it('拡張子のない画像を実データから判定する', async () => {
    const sourcePath = createTempPath('file');
    await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: '#d9a76c',
      },
    })
      .png()
      .toFile(sourcePath);

    await expect(
      resolveMediaExtension({
        sourcePath,
        originalName: 'file',
        mimeType: 'application/octet-stream',
      })
    ).resolves.toBe('png');
  });

  it('MIMEより実データの形式を優先する', async () => {
    const sourcePath = createTempPath('download');
    await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: '#223344',
      },
    })
      .jpeg()
      .toFile(sourcePath);

    await expect(
      resolveMediaExtension({ sourcePath, originalName: 'download', mimeType: 'image/png' })
    ).resolves.toBe('jpg');
  });

  it('未対応のサフィックスを判定済みの拡張子へ置換する', () => {
    expect(ensureMediaExtension('file', 'png')).toBe('file.png');
    expect(ensureMediaExtension('image.bin', 'png')).toBe('image.png');
    expect(ensureMediaExtension('image.jpeg', 'jpg')).toBe('image.jpeg');
  });
});
