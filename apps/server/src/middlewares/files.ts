import fs from 'node:fs';
import path from 'node:path';
import {createFactory} from 'hono/factory';

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

export const fileServer = factory.createMiddleware(async (c) => {
  const rel = c.req.path.replace(/^\/files\//, '');
  const candidates = [
    path.join(storageRoot, rel),
    path.join(storageRoot, 'files', rel),
    path.join(legacyFallbackRoot, rel),
  ];

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
        '.pdf': 'application/pdf',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
      } as Record<string, string>
    )[ext] ?? 'application/octet-stream';

  const size = fs.statSync(full).size;
  const range = c.req.header('range');

  // ---- Range request (video) ----
  if (range && type.startsWith('video/')) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = Number(startStr);
    const end = endStr ? Number(endStr) : size - 1;
    const chunk = end - start + 1;

    const buf = Buffer.alloc(chunk);
    const fd = fs.openSync(full, 'r');
    fs.readSync(fd, buf, 0, chunk, start);
    fs.closeSync(fd);

    return new Response(buf, {
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
  return new Response(fs.readFileSync(full), {
    headers: {
      'Content-Type': type,
      'Content-Length': size.toString(),
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});
