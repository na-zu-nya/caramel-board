import { createFactory } from 'hono/factory';
import { StandaloneMigrationRequiredError } from '../repositories/sqlite/migrations';

export const errorBoundary = createFactory().createMiddleware(
  async (c, next): Promise<Response | undefined> => {
    try {
      await next();
    } catch (err) {
      if (err instanceof StandaloneMigrationRequiredError) {
        return c.json(
          {
            error: 'Standalone migration required',
            migration: err.status,
          },
          503
        );
      }
      console.error('[Unhandled]', err);
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  }
);
