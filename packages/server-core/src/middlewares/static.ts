import fs from 'node:fs';
import path from 'node:path';
import { createFactory } from 'hono/factory';

const factory = createFactory();
const staticRoot = path.resolve(process.env.STATIC_ROOT || 'static');
const indexHtml = path.join(staticRoot, 'index.html');

const normalizeLanguage = (language: string | undefined) => (language === 'ja' ? 'ja' : 'en');

const runtimeLanguageScript = (language: string) => `<script>
(() => {
  const defaultLanguage = ${JSON.stringify(language)};
  const key = 'caramelboard.language';
  window.localStorage.setItem(key, defaultLanguage);
  document.documentElement.lang = defaultLanguage;
  window.__CARAMEL_DEFAULT_LANGUAGE__ = defaultLanguage;
})();
</script>`;

const injectRuntimeConfig = (html: string) => {
  const script = runtimeLanguageScript(normalizeLanguage(process.env.CARAMEL_UI_LANGUAGE));
  return html.includes('</head>')
    ? html.replace('</head>', `${script}</head>`)
    : `${script}${html}`;
};

export const staticServer = factory.createMiddleware(async (c, next) => {
  const p = c.req.path;

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

  const body =
    ext === '.html'
      ? injectRuntimeConfig(fs.readFileSync(file, 'utf-8'))
      : new Uint8Array(fs.readFileSync(file));

  return new Response(body, {
    headers: {
      'Content-Type': ext === '.html' ? `${type}; charset=utf-8` : type,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public,max-age=31536000',
    },
  });
});
