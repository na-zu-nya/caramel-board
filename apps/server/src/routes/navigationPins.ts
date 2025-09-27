import { Hono } from 'hono';
import { z } from 'zod';
import { NavigationPinService } from '../shared/services/NavigationPinService';
import { usePrisma } from '../shared/di';
import { ensureSuperUser } from '../shared/services/UserService';

// リクエストボディのスキーマ定義
const createNavigationPinSchema = z.object({
  type: z.enum(['COLLECTION', 'MEDIA_TYPE', 'OVERVIEW', 'FAVORITES', 'LIKES']),
  name: z.string().min(1).max(255),
  icon: z.string().min(1).max(50),
  order: z.number().int().min(0),
  dataSetId: z.number().int().positive(),
  collectionId: z.number().int().positive().optional(),
  mediaType: z.string().max(50).optional(),
});

const updateNavigationPinSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  icon: z.string().min(1).max(50).optional(),
  order: z.number().int().min(0).optional(),
});

const updateOrderSchema = z.object({
  pins: z.array(
    z.object({
      id: z.number().int().positive(),
      order: z.number().int().min(0),
    })
  ),
});

export const navigationPinsRouter = new Hono();

// Root helper to avoid 500s on direct access
navigationPinsRouter.get('/', (c) => {
  return c.json(
    {
      message: 'Use /api/v1/navigation-pins/dataset/:dataSetId to list pins for a dataset.',
      examples: [
        '/api/v1/navigation-pins/dataset/1',
        'POST /api/v1/navigation-pins { type, name, icon, order, dataSetId, collectionId?, mediaType? }',
      ],
    },
    400
  );
});

navigationPinsRouter.get('/dataset/:dataSetId', async (c) => {
  const dataSetId = Number.parseInt(c.req.param('dataSetId'));
  console.log('GET /navigation-pins/dataset/:dataSetId - dataSetId:', dataSetId);

  if (Number.isNaN(dataSetId)) {
    return c.json({ error: 'Invalid dataset ID' }, 400);
  }

  try {
    const prisma = usePrisma(c);
    const userId = await ensureSuperUser(prisma);
    const navigationPinService = new NavigationPinService(prisma, userId);
    const pins = await navigationPinService.findByDataSet(dataSetId);
    console.log(`Found ${pins.length} navigation pins for dataset ${dataSetId}`);
    return c.json(pins);
  } catch (error) {
    console.error('Error fetching navigation pins:', error);
    return c.json({ error: 'Failed to fetch navigation pins' }, 500);
  }
});

navigationPinsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    console.log('POST /navigation-pins - body:', body);
    const validatedData = createNavigationPinSchema.parse(body);

    const prisma = usePrisma(c);
    const userId = await ensureSuperUser(prisma);
    const navigationPinService = new NavigationPinService(prisma, userId);
    const pin = await navigationPinService.upsert(validatedData);
    console.log('Created/Updated navigation pin:', pin);
    return c.json(pin, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    console.error('Error creating navigation pin:', error);
    return c.json({ error: 'Failed to create navigation pin' }, 500);
  }
});

navigationPinsRouter.put('/order', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = updateOrderSchema.parse(body);

    const prisma = usePrisma(c);
    const userId = await ensureSuperUser(prisma);
    const navigationPinService = new NavigationPinService(prisma, userId);
    await navigationPinService.updateOrder(validatedData.pins);
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    console.error('Error updating navigation pin order:', error);
    return c.json({ error: 'Failed to update navigation pin order' }, 500);
  }
});

navigationPinsRouter.put('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'));

  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid pin ID' }, 400);
  }

  try {
    const body = await c.req.json();
    const validatedData = updateNavigationPinSchema.parse(body);

    const prisma = usePrisma(c);
    const userId = await ensureSuperUser(prisma);
    const navigationPinService = new NavigationPinService(prisma, userId);
    const pin = await navigationPinService.update(id, validatedData);
    return c.json(pin);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    console.error('Error updating navigation pin:', error);
    return c.json({ error: 'Failed to update navigation pin' }, 500);
  }
});

navigationPinsRouter.delete('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'));

  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid pin ID' }, 400);
  }

  try {
    const prisma = usePrisma(c);
    const userId = await ensureSuperUser(prisma);
    const navigationPinService = new NavigationPinService(prisma, userId);
    await navigationPinService.delete(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting navigation pin:', error);
    return c.json({ error: 'Failed to delete navigation pin' }, 500);
  }
});
