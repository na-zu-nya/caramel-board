import type {DataSet} from '@prisma/client';
import {createFactory} from 'hono/factory';
import {usePrisma, useDataStorage} from '../../../shared/di';
import {DataSetService} from '../../../shared/services/DataSetService';
import {createFileService} from '../services/file-service';
import {createSearchService} from '../services/search-service';
import {createStacksService} from '../services/stacks-service';
import {createColorSearchService} from '../services/color-search-service';
import {createTagService} from '../services/tag-service';
import {createStackService} from '../services/stack-service';
import {createAssetService} from '../services/asset-service';
import {createTagStatsService} from '../services/tag-stats-service';
import {DatasetParamSchema} from './dataset-param';

declare module 'hono' {
  interface ContextVariableMap {
    dataSetId: number;
    dataSet: DataSet;
    stacksService: ReturnType<typeof createStacksService>;
    searchService: ReturnType<typeof createSearchService>;
    fileService: ReturnType<typeof createFileService>;
    colorSearchService: ReturnType<typeof createColorSearchService>;
    tagService: ReturnType<typeof createTagService>;
    stackService: ReturnType<typeof createStackService>;
    assetService: ReturnType<typeof createAssetService>;
    tagStatsService: ReturnType<typeof createTagStatsService>;
  }
}

const factory = createFactory();

export const datasetScope = factory.createMiddleware(async (c, next) => {
  const parse = DatasetParamSchema.safeParse(c.req.param());
  if (!parse.success) return c.json(parse.error, 400);

  const { dataSetId } = parse.data;

  const ds = await new DataSetService(usePrisma(c)).getById(dataSetId);
  if (!ds) return c.json({ error: 'DataSet not found' }, 404);

  c.set('dataSet', ds);
  c.set('dataSetId', dataSetId);
  
  // Create services with dependencies
  const prisma = usePrisma(c);
  const fileService = createFileService({ 
    prisma,
    dataStorage: useDataStorage(c)
  });
  
  const colorSearchService = createColorSearchService({
    prisma,
    dataSetId,
  });
  
  const tagService = createTagService({
    prisma,
    dataSetId,
  });
  
  const stackService = createStackService({
    prisma,
    colorSearch: colorSearchService,
    dataSetId,
  });

  const assetService = createAssetService({
    prisma,
    dataStorage: useDataStorage(c),
    dataSetId,
  });

  const tagStatsService = createTagStatsService({
    prisma,
    dataSetId,
  });

  c.set('searchService', createSearchService({
    prisma,
    colorSearch: colorSearchService,
    tagStats: tagStatsService,
    dataSetId,
  }));
  
  c.set('fileService', fileService);
  c.set('colorSearchService', colorSearchService);
  c.set('tagService', tagService);
  c.set('stackService', stackService);
  c.set('assetService', assetService);
  c.set('tagStatsService', tagStatsService);
  c.set('stacksService', createStacksService({
    prisma,
    fileService,
    // embedding removed
  }));
  
  await next();
});
