import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

export const DatasetParamSchema = z.object({
  dataSetId: z.coerce.number().int().positive(),
});

export const datasetParamValidator = zValidator('param', DatasetParamSchema);
