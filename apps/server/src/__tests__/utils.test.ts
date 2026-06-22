import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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
