import { serve } from '@hono/node-server';
import { app } from './app';
import { getMaintenanceTaskRunner } from './maintenance/runner';

const port = Number(process.env.PORT || 6766);
const hostname =
  process.env.HOST ||
  (process.env.CARAMEL_ALLOW_EXTERNAL === '1' || process.env.CARAMEL_ALLOW_EXTERNAL === 'true'
    ? '0.0.0.0'
    : '127.0.0.1');
serve({ fetch: app.fetch, port, hostname }, () =>
  console.log(`🚀  API ready on http://${hostname}:${port}`)
);

// Run any pending maintenance tasks shortly after startup. The database may not be
// configured/migrated yet (e.g. no STANDALONE_SQLITE_PATH), so failures here must not
// take down the server.
setTimeout(() => {
  try {
    getMaintenanceTaskRunner()
      .autoRunPending()
      .catch((error) => {
        console.error('Failed to run pending maintenance tasks', error);
      });
  } catch (error) {
    console.error('Failed to start pending maintenance tasks', error);
  }
}, 5000);

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} received: closing services…`);
    process.exit(0);
  });
}
