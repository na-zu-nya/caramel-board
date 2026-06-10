import { Hono } from 'hono';

export const apiRoutes = new Hono().get('/health', (c) =>
  c.json({
    status: 'ok',
    mode: 'standalone',
    ts: new Date().toISOString(),
    node: process.version,
  })
);
