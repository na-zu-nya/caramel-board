import dotenv from 'dotenv';
import { Hono } from 'hono';
import { basicAuthMiddleware } from './middlewares/basic-auth';
import { clipperApiKeyGuard } from './middlewares/clipper-api-key-guard';
import { corsMiddleware } from './middlewares/cors';
import { errorBoundary } from './middlewares/error-boundary';
import { fileServer } from './middlewares/files';
import { loggerMiddleware } from './middlewares/logger';
import { memMonitor } from './middlewares/memory-monitor';
import { requestOriginGuard } from './middlewares/request-origin-guard';
import { staticServer } from './middlewares/static';
import { StandaloneMigrationRequiredError } from './repositories/sqlite/migrations';
import { getStandaloneSqlite, isStandaloneSqliteEnabled } from './repositories/sqlite/sqlite';
import { apiRoutes } from './routes';
import { diMiddleware } from './shared/di';

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
app.use('*', basicAuthMiddleware);

// --- health (静的配信より先に登録し、SPA フォールバックに奪われないようにする) ---
app.get('/health', (c) => {
  if (isStandaloneSqliteEnabled()) {
    try {
      // 未適用の standalone migration が残っている間は通常利用を開始しない
      getStandaloneSqlite();
    } catch (error) {
      if (error instanceof StandaloneMigrationRequiredError) {
        return c.json(
          {
            status: 'migration_required',
            migration: error.status,
            ts: new Date().toISOString(),
          },
          503
        );
      }
      return c.json(
        {
          status: 'initializing',
          message: error instanceof Error ? error.message : String(error),
          ts: new Date().toISOString(),
        },
        503
      );
    }
  }
  return c.json({ status: 'ok', ts: new Date().toISOString(), node: process.version });
});

// --- asset / static handlers ---
app.use('/files/*', fileServer);
app.use('*', staticServer);

// --- API ---
app.use('/api/v1/*', clipperApiKeyGuard);
app.use('/api/v1/*', requestOriginGuard);
app.route('/api/v1', apiRoutes);
