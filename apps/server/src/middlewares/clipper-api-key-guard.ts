import { createFactory } from 'hono/factory';
import { hasValidClipperApiKey } from '../shared/services/ClipperApiKeyService';
import { isBrowserExtensionOrigin } from './cors';

const factory = createFactory();

const PUBLIC_EXTENSION_PATHS = new Set(['/api/v1/health']);

export const clipperApiKeyGuard = factory.createMiddleware(async (c, next) => {
  const origin = c.req.header('origin');
  if (!origin || !isBrowserExtensionOrigin(origin)) {
    return await next();
  }

  if (PUBLIC_EXTENSION_PATHS.has(c.req.path)) {
    return await next();
  }

  if (!hasValidClipperApiKey(c.req.raw.headers)) {
    return c.json({ error: 'Clipper API key is required' }, 401);
  }

  return await next();
});
