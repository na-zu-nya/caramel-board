import {zValidator} from '@hono/zod-validator';
import {Hono} from 'hono';
import {AutoTagPredictSchema, IdParamSchema} from '../schemas/index.js';
import {PictureService} from '../shared/services/PictureService';

export const picturesRoute = new Hono();
const pictureService = new PictureService();

// Predict tags for a picture
picturesRoute.post(
  '/:id/predict-tags',
  zValidator('param', IdParamSchema),
  zValidator('json', AutoTagPredictSchema),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const { threshold } = c.req.valid('json');
      const result = await pictureService.predictTags(id, threshold);
      return c.json(result);
    } catch (error) {
      console.error('Error predicting tags:', error);
      return c.json({ error: 'Failed to predict tags' }, 500);
    }
  }
);
