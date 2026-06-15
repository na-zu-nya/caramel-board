import { serve } from '@hono/node-server';
import { app } from './app';
import { prisma } from './shared/di';

const port = Number(process.env.PORT || 6766);
const hostname =
  process.env.HOST ||
  (process.env.CARAMEL_ALLOW_EXTERNAL === '1' || process.env.CARAMEL_ALLOW_EXTERNAL === 'true'
    ? '0.0.0.0'
    : '127.0.0.1');
serve({ fetch: app.fetch, port, hostname }, () =>
  console.log(`🚀  API ready on http://${hostname}:${port}`)
);

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n${sig} received: closing services…`);
    await prisma.$disconnect();
    process.exit(0);
  });
}
