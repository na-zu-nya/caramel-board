import dotenv from 'dotenv';
import { Hono } from 'hono';
import { diMiddleware } from './shared/di';

import { corsMiddleware } from './middlewares/cors';
import { errorBoundary } from './middlewares/error-boundary';
import { fileServer } from './middlewares/files';
import { loggerMiddleware } from './middlewares/logger';
import { memMonitor } from './middlewares/memory-monitor';
import { staticServer } from './middlewares/static';

import { apiRoutes } from './routes';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const app = new Hono();

// --- global middlewares ---
app.use('*', errorBoundary);
app.use('*', corsMiddleware);
app.use('*', loggerMiddleware);
app.use('*', memMonitor);
app.use('*', diMiddleware);

// --- asset / static handlers ---
app.use('/files/*', fileServer);
app.use('*', staticServer);

// --- API ---
app.route('/api/v1', apiRoutes);

// --- health ---
app.get('/health', (c) =>
  c.json({ status: 'ok', ts: new Date().toISOString(), node: process.version })
);
