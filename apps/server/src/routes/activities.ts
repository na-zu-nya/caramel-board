import {zValidator} from '@hono/zod-validator';
import {Hono} from 'hono';
import {z} from 'zod';
import {PaginationSchema} from '../schemas/index.js';
import {ActivityService} from '../shared/services/ActivityService';

export const activitiesRoute = new Hono();
const activityService = new ActivityService();

const YearlyLikesSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  datasetId: z.string().optional(),
  search: z.string().optional(),
});

// Get activities grouped by mediaType
activitiesRoute.get('/', zValidator('query', PaginationSchema), async (c) => {
  try {
    const { limit, offset } = c.req.valid('query');
    const result = await activityService.getGroupedByCategory({ limit, offset });
    return c.json(result);
  } catch (error) {
    console.error('Error getting activities:', error);
    return c.json({ error: 'Failed to get activities' }, 500);
  }
});

// Get like activities
activitiesRoute.get('/likes', zValidator('query', PaginationSchema), async (c) => {
  try {
    const { limit, offset } = c.req.valid('query');
    const result = await activityService.getLikes({ limit, offset });
    return c.json(result.activities); // Return only activities array for backward compatibility
  } catch (error) {
    console.error('Error getting like activities:', error);
    return c.json({ error: 'Failed to get like activities' }, 500);
  }
});

// Get like activities by year
activitiesRoute.get('/likes/yearly', zValidator('query', YearlyLikesSchema), async (c) => {
  try {
    const { year, datasetId, search } = c.req.valid('query');
    const result = await activityService.getLikesByYear({ year, datasetId, search });
    return c.json(result);
  } catch (error) {
    console.error('Error getting yearly like activities:', error);
    return c.json({ error: 'Failed to get yearly like activities' }, 500);
  }
});
