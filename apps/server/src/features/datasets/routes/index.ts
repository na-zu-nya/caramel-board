import { Hono } from 'hono';
import { datasetParamValidator } from '../middleware/dataset-param';
import { datasetScope } from '../middleware/dataset-scope';
import { stacks } from './stacks';
// 今後 collectionRoutes 等を追加するならここで

export const datasetRoutes = new Hono()
  .use('/:dataSetId/*', datasetParamValidator, datasetScope)
  .route('/:dataSetId/stacks', stacks);
// .get('/:dataSetId/tags/search', handlers.tagsSearch);
