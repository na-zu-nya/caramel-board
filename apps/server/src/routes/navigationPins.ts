import { Hono } from 'hono';
import { z } from 'zod';
import { StandaloneLibraryRepository } from '../repositories/sqlite/library-repository';

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

type CreateNavigationPinInput = {
  type: 'COLLECTION' | 'MEDIA_TYPE' | 'OVERVIEW' | 'FAVORITES' | 'LIKES';
  name: string;
  icon: string;
  order: number;
  dataSetId: number;
  collectionId?: number;
  mediaType?: string;
};

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

type NavigationPinOrderInput = {
  pins: Array<{ id: number; order: number }>;
};

export const navigationPinsRouter = new Hono();
const libraryRepository = new StandaloneLibraryRepository();

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
  const dataSetId = Number.parseInt(c.req.param('dataSetId'), 10);
  console.log('GET /navigation-pins/dataset/:dataSetId - dataSetId:', dataSetId);

  if (Number.isNaN(dataSetId)) {
    return c.json({ error: 'Invalid dataset ID' }, 400);
  }

  try {
    const pins = libraryRepository.getNavigationPins(dataSetId);
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
    const validatedData = createNavigationPinSchema.parse(body) as CreateNavigationPinInput;
    const pin = libraryRepository.upsertNavigationPin(validatedData);
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
    const validatedData = updateOrderSchema.parse(body) as NavigationPinOrderInput;
    libraryRepository.updateNavigationPinOrder(validatedData.pins);
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
  const id = Number.parseInt(c.req.param('id'), 10);

  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid pin ID' }, 400);
  }

  try {
    const body = await c.req.json();
    const validatedData = updateNavigationPinSchema.parse(body);
    const pin = libraryRepository.updateNavigationPin(id, validatedData);
    if (!pin) return c.json({ error: 'Navigation pin not found' }, 404);
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
  const id = Number.parseInt(c.req.param('id'), 10);

  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid pin ID' }, 400);
  }

  try {
    const ok = libraryRepository.deleteNavigationPin(id);
    if (!ok) return c.json({ error: 'Navigation pin not found' }, 404);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting navigation pin:', error);
    return c.json({ error: 'Failed to delete navigation pin' }, 500);
  }
});
