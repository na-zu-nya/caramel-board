import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DataStorage } from '../lib/DataStorage';
import { generateMediaPreview, shouldGeneratePreview } from '../utils/generateMediaPreview';
import { isPdfFileInput } from '../utils/pdfImport';

describe('Test', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });
});

describe('PDF互換ベクトル取り込み判定', () => {
  it('AIファイルをPDFラスタライズ経路に入れる', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-ai-import-'));
    const filePath = path.join(tempDir, 'artwork.ai');
    writeFileSync(filePath, '%!PS-Adobe-3.0 EPSF-3.0\n');

    try {
      await expect(
        isPdfFileInput({
          path: filePath,
          originalname: 'artwork.ai',
          mimetype: 'application/postscript',
          size: 24,
        })
      ).resolves.toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('PDFシグネチャを持つ拡張子なしファイルもPDFとして扱う', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-pdf-import-'));
    const filePath = path.join(tempDir, 'upload');
    writeFileSync(filePath, '%PDF-1.7\n');

    try {
      await expect(
        isPdfFileInput({
          path: filePath,
          originalname: 'upload',
          mimetype: 'application/octet-stream',
          size: 9,
        })
      ).resolves.toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('SVGプレビュー生成', () => {
  it('SVGをPNGプレビュー対象として生成する', async () => {
    expect(shouldGeneratePreview('svg')).toBe(true);
    expect(shouldGeneratePreview('.svgz')).toBe(true);

    const previousStorage = process.env.FILES_STORAGE;
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-svg-preview-'));
    process.env.FILES_STORAGE = tempDir;

    const fileKey = 'library/1/assets/ab/source.svg';
    const inputPath = DataStorage.getPath(fileKey);
    mkdirSync(path.dirname(inputPath), { recursive: true });
    writeFileSync(
      inputPath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128" viewBox="0 0 256 128"><rect width="256" height="128" fill="#fff"/><path d="M24 96 C80 20 156 20 232 96" fill="none" stroke="#222" stroke-width="12"/></svg>'
    );

    try {
      const previewKey = await generateMediaPreview(fileKey, 'abcdef1234567890', 'svg', {
        dataSetId: 1,
        force: true,
      });

      expect(previewKey).not.toBeNull();
      if (!previewKey) return;
      expect(previewKey).toBe('library/1/preview/ab/abcdef1234567890.png');
      expect(existsSync(DataStorage.getPath(previewKey))).toBe(true);
    } finally {
      if (previousStorage === undefined) {
        delete process.env.FILES_STORAGE;
      } else {
        process.env.FILES_STORAGE = previousStorage;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('RAWプレビュー生成', () => {
  it('DNGをPNGプレビュー対象として扱う', async () => {
    expect(shouldGeneratePreview('dng')).toBe(true);
    expect(shouldGeneratePreview('.DNG')).toBe(true);
  });
});
