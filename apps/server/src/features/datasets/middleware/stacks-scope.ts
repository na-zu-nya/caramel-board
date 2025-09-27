import type { Stack } from '@prisma/client';
import { createFactory } from 'hono/factory';
import { z } from 'zod';

declare module 'hono' {
  interface ContextVariableMap {
    stack: Stack;
  }
}

const StacksIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const factory = createFactory();

export const stackScope = factory.createMiddleware(async (c, next) => {
  const parse = StacksIdParamSchema.safeParse(c.req.param());
  if (!parse.success) return c.json(parse.error, 400);

  const { id } = parse.data;

  const dataSetId = c.get('dataSetId');
  const stackService = c.get('stacksService');
  const stack = await stackService.getStacks(id);
  if (!stack) return c.json({ error: 'Stack not found' }, 404);
  if (stack.dataSetId !== dataSetId) return c.json({ error: 'Invalid dataSet' }, 403);

  c.set('stack', stack);
  await next();
});
