import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createFactory } from 'hono/factory';

const factory = createFactory();

const detectStorageRoot = () => {
  if (process.env.FILES_STORAGE) {
    return path.resolve(process.env.FILES_STORAGE);
  }

  const candidates = [
    path.resolve('./data/assets'),
    path.resolve('./assets'),
    path.resolve('./data'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore and keep searching
    }
  }

  return path.resolve('./data');
};

const storageRoot = detectStorageRoot();
const legacyFallbackRoot = path.resolve(storageRoot, '..');

const uniquePaths = (values: string[]) => [...new Set(values.filter(Boolean))];

const storageCandidatesFor = (relativePath: string) => {
  const rel = relativePath.replace(/^\/+/, '');
  return uniquePaths([
    path.join(storageRoot, rel),
    rel.startsWith('library/') ? path.join(storageRoot, rel.replace(/^library\//, '')) : '',
    path.join(storageRoot, 'files', rel),
    path.join(legacyFallbackRoot, rel),
  ]);
};

const createFileBody = (
  filePath: string,
  options?: { start?: number; end?: number }
): ReadableStream<Uint8Array> =>
  Readable.toWeb(fs.createReadStream(filePath, options)) as ReadableStream<Uint8Array>;

export const fileServer = factory.createMiddleware(async (c) => {
  const rel = c.req.path.replace(/^\/files\//, '');
  const candidates = storageCandidatesFor(rel);

  const full = candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });

  if (!full) {
    return c.notFound();
  }

  const ext = path.extname(full).toLowerCase();
  const type =
    (
      {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.svgz': 'image/svg+xml',
        '.dng': 'image/x-adobe-dng',
        '.tif': 'image/tiff',
        '.tiff': 'image/tiff',
        '.avif': 'image/avif',
        '.bmp': 'image/bmp',
        '.pdf': 'application/pdf',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
      } as Record<string, string>
    )[ext] ?? 'application/octet-stream';

  const size = fs.statSync(full).size;
  const range = c.req.header('range');

  // ---- Range request ----
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(startStr, 10);
    const requestedEnd = endStr ? Number.parseInt(endStr, 10) : size - 1;
    const end = Math.min(requestedEnd, size - 1);

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      start >= size
    ) {
      return new Response(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${size}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const chunk = end - start + 1;
    return new Response(createFileBody(full, { start, end }), {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunk.toString(),
        'Content-Type': type,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  }

  // ---- Normal file ----
  return new Response(createFileBody(full), {
    headers: {
      'Content-Type': type,
      ...(ext === '.svgz' ? { 'Content-Encoding': 'gzip' } : {}),
      'Content-Length': size.toString(),
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});
