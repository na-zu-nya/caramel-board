import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { DataStorage } from '../lib/DataStorage';
import { buildOriginalKey } from './assetPath';
import { getHash } from './functions';

const execFileAsync = promisify(execFile);

export const PDF_RASTER_DPI = 350;
const PDF_PAGE_EXTENSION = 'jpg';
const PDF_PAGE_MIME_TYPE = 'image/jpeg' as const;

interface FileInput {
  path: string;
  originalname: string;
  mimetype?: string;
  size?: number;
}

export interface PdfOriginalMeta {
  file: string;
  originalName: string;
  size: number;
  hash: string;
  mimeType: 'application/pdf';
  pageCount: number;
  rasterDpi: number;
  importId: string;
  createdAt: string;
}

export interface PdfRasterPage {
  pageNumber: number;
  path: string;
  originalname: string;
  mimetype: typeof PDF_PAGE_MIME_TYPE;
  size: number;
  storageHash: string;
}

export interface PreparedPdfImport {
  original: PdfOriginalMeta;
  pages: PdfRasterPage[];
  cleanup: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getErrorCode = (error: unknown): string | undefined => {
  if (!isRecord(error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
};

const getErrorText = (error: unknown): string => {
  if (!isRecord(error)) return error instanceof Error ? error.message : String(error);
  const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : '';
  if (stderr) return stderr;
  return error instanceof Error ? error.message : String(error);
};

const getRasterizerCandidates = () => {
  const candidates = [process.env.PDF_RASTERIZER_PATH, 'pdftocairo', 'pdftocairo.exe'].filter(
    (candidate): candidate is string => Boolean(candidate?.trim())
  );

  if (process.platform === 'win32') {
    const appDataTools = process.env.APPDATA
      ? path.join(process.env.APPDATA, 'Caramel Board', 'tools', 'poppler')
      : null;
    const localAppDataTools = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Caramel Board', 'tools', 'poppler')
      : null;
    for (const toolsRoot of [appDataTools, localAppDataTools]) {
      if (!toolsRoot) continue;
      candidates.push(
        path.join(toolsRoot, 'Library', 'bin', 'pdftocairo.exe'),
        path.join(toolsRoot, 'bin', 'pdftocairo.exe')
      );
    }
    candidates.push(
      'C:\\msys64\\mingw64\\bin\\pdftocairo.exe',
      'C:\\msys64\\ucrt64\\bin\\pdftocairo.exe',
      'C:\\Program Files\\poppler\\Library\\bin\\pdftocairo.exe',
      'C:\\Program Files\\poppler\\bin\\pdftocairo.exe'
    );
  } else {
    candidates.push(
      '/opt/homebrew/bin/pdftocairo',
      '/usr/local/bin/pdftocairo',
      '/usr/bin/pdftocairo'
    );
  }

  return Array.from(new Set(candidates));
};

const createTempDir = () => {
  const storageRoot = process.env.FILES_STORAGE || path.resolve('./data');
  const tmpRoot = path.join(storageRoot, 'tmp', 'pdf-pages');
  fs.mkdirSync(tmpRoot, { recursive: true });
  return fs.mkdtempSync(path.join(tmpRoot, 'pdf-'));
};

const collectRasterizedPages = (outputDir: string) => {
  const pages: Array<{ pageNumber: number; path: string }> = [];
  const pagePattern = /^page-(\d+)\.jpg$/i;

  for (const filename of fs.readdirSync(outputDir)) {
    const match = filename.match(pagePattern);
    if (!match) continue;
    pages.push({
      pageNumber: Number.parseInt(match[1], 10),
      path: path.join(outputDir, filename),
    });
  }

  return pages.sort((left, right) => left.pageNumber - right.pageNumber);
};

const runPdftocairo = async (pdfPath: string, outputDir: string, dpi: number) => {
  const args = [
    '-jpeg',
    '-r',
    String(dpi),
    '-jpegopt',
    'quality=92,optimize=y',
    pdfPath,
    path.join(outputDir, 'page'),
  ];
  const timeout = Number.parseInt(process.env.PDF_RASTERIZER_TIMEOUT_MS ?? '', 10) || 10 * 60_000;
  let lastError: unknown = null;

  for (const candidate of getRasterizerCandidates()) {
    try {
      await execFileAsync(candidate, args, {
        timeout,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      return;
    } catch (error) {
      lastError = error;
      if (getErrorCode(error) === 'ENOENT') {
        continue;
      }
      throw new Error(`PDFのラスタライズに失敗しました: ${getErrorText(error)}`);
    }
  }

  throw new Error(
    `PDFのラスタライズには Poppler の pdftocairo が必要です。PDF_RASTERIZER_PATH を設定するか、pdftocairo をPATHに追加してください。${lastError ? ` (${getErrorText(lastError)})` : ''}`
  );
};

const createPageStorageHash = (pdfHash: string, importId: string, pageNumber: number) =>
  createHash('sha256').update(`${pdfHash}:${importId}:${pageNumber}`).digest('hex');

const isPdfOriginalMeta = (value: unknown): value is PdfOriginalMeta => {
  if (!isRecord(value)) return false;
  return (
    typeof value.file === 'string' &&
    typeof value.originalName === 'string' &&
    typeof value.hash === 'string' &&
    typeof value.importId === 'string' &&
    typeof value.size === 'number' &&
    typeof value.pageCount === 'number' &&
    typeof value.rasterDpi === 'number'
  );
};

export const isPdfFileInput = async (file: FileInput) => {
  const mimeType = file.mimetype?.toLowerCase() ?? '';
  if (mimeType === 'application/pdf') return true;
  if (path.extname(file.originalname).toLowerCase() === '.pdf') return true;

  try {
    const handle = fs.openSync(file.path, 'r');
    try {
      const signature = Buffer.alloc(5);
      const bytesRead = fs.readSync(handle, signature, 0, signature.length, 0);
      return bytesRead === signature.length && signature.toString('ascii') === '%PDF-';
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    return false;
  }
};

export const appendPdfOriginalMeta = (
  meta: unknown,
  original: PdfOriginalMeta
): Record<string, unknown> => {
  const base = isRecord(meta) ? { ...meta } : {};
  const existing = extractPdfOriginalsFromMeta(base).filter(
    (entry) => entry.file !== original.file
  );
  return {
    ...base,
    sourceType: 'pdf',
    sourcePdf: original,
    sourcePdfs: [...existing, original],
  };
};

export const extractPdfOriginalsFromMeta = (meta: unknown): PdfOriginalMeta[] => {
  if (!isRecord(meta)) return [];
  const entries: PdfOriginalMeta[] = [];

  if (isPdfOriginalMeta(meta.sourcePdf)) {
    entries.push(meta.sourcePdf);
  }

  if (Array.isArray(meta.sourcePdfs)) {
    for (const entry of meta.sourcePdfs) {
      if (isPdfOriginalMeta(entry)) {
        entries.push(entry);
      }
    }
  }

  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.file)) return false;
    seen.add(entry.file);
    return true;
  });
};

export const preparePdfImport = async (
  file: FileInput,
  dataSetId: number,
  dpi = PDF_RASTER_DPI
): Promise<PreparedPdfImport> => {
  const pdfHash = await getHash(file.path);
  const importId = randomUUID();
  const originalKey = buildOriginalKey(dataSetId, pdfHash, 'pdf');
  const originalPath = DataStorage.getPath(originalKey);
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  let copiedOriginal = false;
  if (!fs.existsSync(originalPath)) {
    fs.copyFileSync(file.path, originalPath);
    copiedOriginal = true;
  }

  const outputDir = createTempDir();
  try {
    await runPdftocairo(originalPath, outputDir, dpi);
    const rasterizedPages = collectRasterizedPages(outputDir);
    if (rasterizedPages.length === 0) {
      throw new Error('PDFからページ画像を生成できませんでした');
    }

    const baseName =
      path.basename(file.originalname, path.extname(file.originalname)) || 'document';
    const pages: PdfRasterPage[] = rasterizedPages.map((page) => {
      const storageHash = createPageStorageHash(pdfHash, importId, page.pageNumber);
      const pageName = `${baseName}-p${String(page.pageNumber).padStart(3, '0')}.${PDF_PAGE_EXTENSION}`;
      const stat = fs.statSync(page.path);
      return {
        pageNumber: page.pageNumber,
        path: page.path,
        originalname: pageName,
        mimetype: PDF_PAGE_MIME_TYPE,
        size: stat.size,
        storageHash,
      };
    });

    return {
      original: {
        file: originalKey,
        originalName: file.originalname,
        size: file.size ?? fs.statSync(file.path).size,
        hash: pdfHash,
        mimeType: 'application/pdf',
        pageCount: pages.length,
        rasterDpi: dpi,
        importId,
        createdAt: new Date().toISOString(),
      },
      pages,
      cleanup: () => {
        try {
          fs.rmSync(outputDir, { recursive: true, force: true });
        } catch {}
        try {
          fs.rmSync(file.path, { force: true });
        } catch {}
      },
    };
  } catch (error) {
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(file.path, { force: true });
    } catch {}
    if (copiedOriginal) {
      try {
        fs.rmSync(originalPath, { force: true });
      } catch {}
    }
    throw error;
  }
};
