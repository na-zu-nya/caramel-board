import {Hono} from 'hono';

// Mount legacy-stable routes consumed by the client
import {datasetsLiteRoute} from './routes/datasets-lite';
import {collectionsRoute} from './routes/collections';
import {stacksRoute} from './routes/stacks';
import {collectionFoldersRoute} from './routes/collectionFolders';
import {colorsRoute} from './routes/colors';
import {tagsRoute} from './routes/tags';
import {authorsRoute} from './routes/authors';
import {activitiesRoute} from './routes/activities';
import {navigationPinsRouter} from './routes/navigationPins';
import {uploadRoute} from './routes/upload';
import {datasetStacksRoute} from './routes/datasetStacks';
import {assetsLiteRoute} from './routes/assets-lite';
import {autoTagsRoute} from './routes/autoTags';
import {datasetAssetsRoute} from './routes/dataset-assets';

// If/when feature routes are fully migrated, they can be re-enabled here.
// legacy feature routes removed

export const apiRoutes = new Hono()
  // Health check under API prefix to match infra expectations
  .get('/health', (c) =>
    c.json({ status: 'ok', ts: new Date().toISOString(), node: process.version })
  )
  .route('/datasets', datasetsLiteRoute)
  // Dataset-scoped stacks routes (search, similar, CRUD)
  .route('/datasets', datasetStacksRoute)
  // Dataset-scoped assets under datasets
  .route('/datasets', datasetAssetsRoute)
  .route('/stacks', stacksRoute)
  .route('/assets', assetsLiteRoute)
  // Only mount minimal routes needed for initial app load
  // (others can be re-enabled once dependencies are aligned)
  .route('/collections', collectionsRoute)
  .route('/collection-folders', collectionFoldersRoute)
  .route('/colors', colorsRoute)
  .route('/tags', tagsRoute)
  .route('/authors', authorsRoute)
  .route('/activities', activitiesRoute)
  .route('/navigation-pins', navigationPinsRouter)
  .route('/upload', uploadRoute)
  // Auto-Tag endpoints (mappings, statistics, CRUD)
  .route('/auto-tags', autoTagsRoute);
