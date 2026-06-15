import {
  basicAuthMiddleware,
  corsMiddleware,
  errorBoundary,
  fileServer,
  loggerMiddleware,
  memMonitor,
  staticServer,
} from '@caramelboard/server-core';
import { Hono } from 'hono';
import { apiRoutes } from './routes';

export const app = new Hono();

app.use('*', errorBoundary);
app.use('*', corsMiddleware);
app.use('*', loggerMiddleware);
app.use('*', memMonitor);
app.use('*', basicAuthMiddleware);

app.use('/files/*', fileServer);
app.use('*', staticServer);

app.route('/api/v1', apiRoutes);

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    mode: 'standalone',
    ts: new Date().toISOString(),
    node: process.version,
  })
);
