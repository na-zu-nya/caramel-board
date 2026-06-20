import { cors } from 'hono/cors';

export const CARAMEL_BOARD_CLIPPER_CHROME_EXTENSION_ID = 'hmbbjgdimepjnnpbedcdhidcfhgllcjo';
export const CARAMEL_BOARD_CLIPPER_CHROME_EXTENSION_ORIGIN = `chrome-extension://${CARAMEL_BOARD_CLIPPER_CHROME_EXTENSION_ID}`;

const DEFAULT_ALLOWED_ORIGIN_PATTERNS = [
  /^moz-extension:\/\/[0-9a-f-]+$/i,
  /^safari-web-extension:\/\/[0-9a-f-]+$/i,
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^http:\/\/\[::1\](?::\d+)?$/,
] as const;

const configuredOrigins = () =>
  (process.env.CARAMEL_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

export const isBrowserExtensionOrigin = (origin: string) =>
  /^chrome-extension:\/\/[a-z]+$/.test(origin) ||
  /^moz-extension:\/\/[0-9a-f-]+$/i.test(origin) ||
  /^safari-web-extension:\/\/[0-9a-f-]+$/i.test(origin);

export const isAllowedBrowserExtensionOrigin = (origin: string) =>
  origin === CARAMEL_BOARD_CLIPPER_CHROME_EXTENSION_ORIGIN || configuredOrigins().includes(origin);

export const isAllowedBrowserOrigin = (origin: string) => {
  if (!origin) return false;

  const extraOrigins = configuredOrigins();
  if (extraOrigins.includes('*') || extraOrigins.includes(origin)) return true;
  if (origin === CARAMEL_BOARD_CLIPPER_CHROME_EXTENSION_ORIGIN) return true;

  return DEFAULT_ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
};

export const corsMiddleware = cors({
  credentials: true,
  origin: (origin) => (isAllowedBrowserOrigin(origin) ? origin : null),
});
