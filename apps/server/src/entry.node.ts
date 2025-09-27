import { serve } from '@hono/node-server';
import { app } from './app';
import { prisma } from './shared/di';

const port = Number(process.env.PORT || 9000);
serve({ fetch: app.fetch, port }, () => console.log(`🚀  API ready on http://localhost:${port}`));

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n${sig} received: closing services…`);
    await prisma.$disconnect();
    process.exit(0);
  });
}
