import { createFactory } from 'hono/factory';
import { isAllowedBrowserOrigin } from './cors';

const factory = createFactory();

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

const isBrowserCrossSiteRequest = (secFetchSite: string | undefined) =>
  Boolean(secFetchSite) && !TRUSTED_FETCH_SITES.has(secFetchSite ?? '');

const isSameRequestOrigin = (origin: string, requestUrl: string) => {
  try {
    return new URL(requestUrl).origin === origin;
  } catch {
    return false;
  }
};

export const requestOriginGuard = factory.createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    return await next();
  }

  const origin = c.req.header('origin');
  if (origin) {
    if (!isSameRequestOrigin(origin, c.req.url) && !isAllowedBrowserOrigin(origin)) {
      return c.json({ error: 'Untrusted request origin' }, 403);
    }
    return await next();
  }

  if (isBrowserCrossSiteRequest(c.req.header('sec-fetch-site'))) {
    return c.json({ error: 'Cross-site API request blocked' }, 403);
  }

  return await next();
});
