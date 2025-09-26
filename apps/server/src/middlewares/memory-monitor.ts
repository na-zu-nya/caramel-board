import {createFactory} from 'hono/factory';

export const memMonitor = createFactory().createMiddleware(async (_, next) => {
  await next();
  const { heapUsed, rss } = process.memoryUsage();
  if (heapUsed / 1024 / 1024 > 3000) {
    console.warn(
      `[Memory] Heap ${Math.round(heapUsed / 1e6)} MB / RSS ${Math.round(rss / 1e6)} MB`
    );
  }
});
