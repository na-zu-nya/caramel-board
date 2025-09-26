import {createFactory} from 'hono/factory';

export const errorBoundary = createFactory().createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (err) {
    console.error('[Unhandled]', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});
