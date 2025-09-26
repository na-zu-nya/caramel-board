import fs from 'node:fs';
import path from 'node:path';
import {createFactory} from 'hono/factory';

const factory = createFactory();
const staticRoot = path.resolve('static');
const indexHtml = path.join(staticRoot, 'index.html');

export const staticServer = factory.createMiddleware(async (c, next) => {
  const p = c.req.path;

  // API / files はスキップ
  if (p.startsWith('/api') || p.startsWith('/files')) return await next();

  const target = path.join(staticRoot, p.replace(/^\//, '') || 'index.html');
  const exists = fs.existsSync(target) && fs.statSync(target).isFile();

  const file = exists ? target : indexHtml;
  const ext = path.extname(file).toLowerCase();
  const type =
    (
      {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
      } as Record<string, string>
    )[ext] ?? 'application/octet-stream';

  return new Response(fs.readFileSync(file), {
    headers: {
      'Content-Type': type,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public,max-age=31536000',
    },
  });
});
