import { timingSafeEqual } from 'node:crypto';
import { createFactory } from 'hono/factory';

const factory = createFactory();

const isEnabled = () =>
  process.env.CARAMEL_BASIC_AUTH_ENABLED === '1' ||
  process.env.CARAMEL_BASIC_AUTH_ENABLED === 'true';

const safeEquals = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const parseBasicAuth = (header: string | undefined) => {
  if (!header?.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return null;
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
};

export const basicAuthMiddleware = factory.createMiddleware(async (c, next) => {
  if (!isEnabled()) return await next();
  if (c.req.path === '/health' || c.req.path === '/api/v1/health') return await next();

  const username = process.env.CARAMEL_BASIC_AUTH_USERNAME || '';
  const password = process.env.CARAMEL_BASIC_AUTH_PASSWORD || '';
  if (!username || !password) {
    return c.text('Basic auth is enabled but credentials are not configured', 503);
  }

  const credential = parseBasicAuth(c.req.header('authorization'));
  const authenticated =
    credential &&
    safeEquals(credential.username, username) &&
    safeEquals(credential.password, password);

  if (authenticated) return await next();

  return c.text('Unauthorized', 401, {
    'WWW-Authenticate': 'Basic realm="Caramel Board"',
  });
});
