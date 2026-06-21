#!/usr/bin/env node

import crypto from 'node:crypto';
import fs, { createReadStream, createWriteStream, promises as fsp } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..', '..');

const importFilePath = (filePath) => import(pathToFileURL(filePath).href);

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(serverRoot, '.env'), override: false });

let prismaModule;
let prismaSource = '';
try {
  prismaSource = path.join(serverRoot, 'node_modules/@prisma/client/index.js');
  prismaModule = await importFilePath(prismaSource);
} catch (localError) {
  try {
    prismaSource = require.resolve('@prisma/client');
    prismaModule = await importFilePath(prismaSource);
  } catch (primaryError) {
    console.error('[standalone-export] @prisma/client を読み込めませんでした');
    console.error(`local: ${localError?.message ?? localError}`);
    console.error(`root: ${primaryError?.message ?? primaryError}`);
    process.exit(1);
  }
}

const { PrismaClient } = prismaModule;
const prisma = new PrismaClient();

const EXPORT_VERSION = 1;
const DEFAULT_BATCH_SIZE = 1000;
const MIN_EXPORTED_AUTO_TAG_SCORE = 0.4;
const MAX_FALLBACK_SCORE_ROWS_PER_PREDICTION = 200;
const args = process.argv.slice(2);

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const hasFlag = (name) => args.includes(`--${name}`);

const resolveUserPath = (value) => (path.isAbsolute(value) ? value : path.join(repoRoot, value));

const parseIntegerArg = (name) => {
  const raw = getArgValue(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} は正の整数で指定してください`);
  }
  return value;
};

const formatTimestampForPath = (date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

const generatedAt = new Date();
let datasetId;
let batchSize;
try {
  datasetId = parseIntegerArg('dataset');
  batchSize = parseIntegerArg('batch-size') ?? DEFAULT_BATCH_SIZE;
} catch (error) {
  console.error(`[standalone-export] ${error.message}`);
  process.exit(1);
}
const verifyFiles = hasFlag('verify-files');
const force = hasFlag('force');
const outputRoot = path.resolve(
  resolveUserPath(
    getArgValue('out') ??
      path.join(
        repoRoot,
        'exports',
        `caramel-board-standalone-export-${formatTimestampForPath(generatedAt)}`
      )
  )
);
const dataDir = path.join(outputRoot, 'data');

const detectStorageRoot = () => {
  const explicit = getArgValue('storage-root');
  if (explicit) return resolveUserPath(explicit);
  if (process.env.FILES_STORAGE) return path.resolve(process.env.FILES_STORAGE);

  const candidates = [
    path.join(repoRoot, 'data/assets'),
    path.join(repoRoot, 'assets'),
    path.join(repoRoot, 'data'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return path.join(repoRoot, 'data/assets');
};

const storageRoot = detectStorageRoot();

const ensureOutputDirectory = async () => {
  if (!fs.existsSync(outputRoot)) {
    await fsp.mkdir(dataDir, { recursive: true });
    return;
  }

  const entries = await fsp.readdir(outputRoot);
  if (entries.length === 0) {
    await fsp.mkdir(dataDir, { recursive: true });
    return;
  }

  if (!force) {
    throw new Error(`出力先が空ではありません: ${outputRoot} (--force で上書きできます)`);
  }

  await fsp.rm(outputRoot, { recursive: true, force: true });
  await fsp.mkdir(dataDir, { recursive: true });
};

const toIso = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
};

const toJsonText = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  return JSON.stringify(value);
};

const toBooleanInt = (value) => (value ? 1 : 0);

const stringifyLine = (record) =>
  `${JSON.stringify(record, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  )}\n`;

const writeLine = async (stream, record) => {
  if (!stream.write(stringifyLine(record))) {
    await waitForWritableEvent(stream, 'drain');
  }
};

const waitForWritableEvent = (stream, event) =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off(event, onEvent);
      stream.off('error', onError);
      stream.off('close', onClose);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error(`NDJSON write stream closed before ${event}`));
    };

    stream.once(event, onEvent);
    stream.once('error', onError);
    stream.once('close', onClose);
  });

const closeStream = async (stream) => {
  const finish = waitForWritableEvent(stream, 'finish');
  stream.end();
  await finish;
};

const hashFile = async (filePath) => {
  const hash = crypto.createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
};

const normalizePathKey = (key) => {
  if (!key || typeof key !== 'string') return '';
  const withoutProtocol = key.replace(/^https?:\/\/[^/]+/i, '');
  return withoutProtocol.replace(/^\/+/, '');
};

const storageCandidates = (key) => {
  const normalized = normalizePathKey(key);
  if (!normalized) return [];
  const candidates = [path.join(storageRoot, normalized)];
  if (normalized.startsWith('library/')) {
    candidates.push(path.join(storageRoot, normalized.replace(/^library\//, '')));
    candidates.push(path.join(path.dirname(storageRoot), normalized));
  }
  if (normalized.startsWith('files/')) {
    candidates.push(path.join(storageRoot, normalized.replace(/^files\//, '')));
  }
  return [...new Set(candidates)];
};

const verifyFileReference = async (key) => {
  if (!verifyFiles) return {};

  for (const candidate of storageCandidates(key)) {
    try {
      const stat = await fsp.stat(candidate);
      if (stat.isFile()) {
        return { exists: true, size: stat.size };
      }
    } catch {
      // 次の候補を確認する
    }
  }

  return { exists: false };
};

const writeNdjson = async (fileName, writer) => {
  const filePath = path.join(dataDir, fileName);
  const stream = createWriteStream(filePath, { encoding: 'utf8' });
  let rows = 0;

  const write = async (record) => {
    rows += 1;
    await writeLine(stream, record);
  };

  try {
    await writer(write);
  } finally {
    await closeStream(stream);
  }

  return {
    path: `data/${fileName}`,
    rows,
    bytes: (await fsp.stat(filePath)).size,
    sha256: await hashFile(filePath),
  };
};

const exportPaginated = async ({ fileName, query, map }) =>
  writeNdjson(fileName, async (write) => {
    let skip = 0;
    for (;;) {
      const rows = await query({ skip, take: batchSize });
      if (rows.length === 0) break;
      for (const row of rows) {
        const mapped = map(row);
        if (Array.isArray(mapped)) {
          for (const item of mapped) {
            await write(item);
          }
        } else if (mapped) {
          await write(mapped);
        }
      }
      skip += rows.length;
      console.log(`[standalone-export] ${fileName}: ${skip}...`);
    }
  });

const datasetWhere = datasetId ? { id: datasetId } : {};
const directDatasetWhere = datasetId ? { dataSetId: datasetId } : {};
const stackWhere = datasetId ? { dataSetId: datasetId } : {};
const assetWhere = datasetId ? { stack: { dataSetId: datasetId } } : {};

const queryAuthorLinks = (page) => {
  if (datasetId) {
    return prisma.$queryRaw`
      SELECT
        l."id",
        l."authorId",
        l."provider",
        l."label",
        l."url",
        l."externalId",
        l."sortOrder",
        l."createdAt",
        l."updatedAt"
      FROM "AuthorLink" l
      JOIN "Author" a ON a."id" = l."authorId"
      WHERE a."dataSetId" = ${datasetId}
      ORDER BY l."id" ASC
      LIMIT ${page.take} OFFSET ${page.skip}
    `;
  }

  return prisma.$queryRaw`
    SELECT
      l."id",
      l."authorId",
      l."provider",
      l."label",
      l."url",
      l."externalId",
      l."sortOrder",
      l."createdAt",
      l."updatedAt"
    FROM "AuthorLink" l
    ORDER BY l."id" ASC
    LIMIT ${page.take} OFFSET ${page.skip}
  `;
};

const mapDataset = (row) => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  theme_color: row.themeColor,
  description: row.description,
  settings_json: toJsonText(row.settings, '{}'),
  is_protected: toBooleanInt(row.isProtected),
  password_hash: row.passwordHash,
  password_salt: row.passwordSalt,
  is_default: toBooleanInt(row.isDefault),
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updatedAt),
});

const mapUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  password_hash: row.passwordHash,
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updatedAt),
});

const mapAuthor = (row) => ({
  id: row.id,
  dataset_id: row.dataSetId,
  name: row.name,
});

const mapAuthorLink = (row) => ({
  id: row.id,
  author_id: row.authorId,
  provider: row.provider,
  label: row.label,
  url: row.url,
  external_id: row.externalId,
  sort_order: row.sortOrder,
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updatedAt),
});

const mapStack = (row) => ({
  id: row.id,
  dataset_id: row.dataSetId,
  author_id: row.authorId,
  name: row.name,
  thumbnail: row.thumbnail,
  media_type: row.mediaType,
  liked: row.liked,
  meta_json: toJsonText(row.meta),
  dominant_colors_json: toJsonText(row.dominantColors),
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updateAt),
});

const mapAsset = (row) => ({
  id: row.id,
  stack_id: row.stackId,
  file: row.file,
  thumbnail: row.thumbnail,
  preview: row.preview,
  file_type: row.fileType,
  original_name: row.originalName,
  hash: row.hash,
  order_in_stack: row.orderInStack,
  meta_json: toJsonText(row.meta),
  dominant_colors_json: toJsonText(row.dominantColors),
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updateAt),
});

const mapTag = (row) => ({
  id: row.id,
  dataset_id: row.dataSetId,
  title: row.title,
});

const mapStackTag = (row) => ({
  stack_id: row.stackId,
  tag_id: row.tagId,
});

const mapCollection = (row) => ({
  id: row.id,
  dataset_id: row.dataSetId,
  folder_id: row.folderId,
  name: row.name,
  icon: row.icon,
  description: row.description,
  type: row.type,
  filter_config_json: toJsonText(row.filterConfig),
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updatedAt),
});

const mapCollectionFolder = (row) => ({
  id: row.id,
  dataset_id: row.dataSetId,
  parent_id: row.parentId,
  name: row.name,
  icon: row.icon,
  description: row.description,
  sort_order: row.order,
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updatedAt),
});

const mapCollectionStack = (row) => ({
  collection_id: row.collectionId,
  stack_id: row.stackId,
  added_at: toIso(row.addedAt),
  order_index: row.orderIndex,
});

const mapStackFavorite = (row) => ({
  id: row.id,
  user_id: row.userId,
  stack_id: row.stackId,
  created_at: toIso(row.createdAt),
});

const mapAssetFavorite = (row) => ({
  id: row.id,
  user_id: row.userId,
  asset_id: row.assetId,
  created_at: toIso(row.createdAt),
});

const mapLikeActivity = (row) => ({
  id: row.id,
  stack_id: row.stackId,
  asset_id: row.assetId,
  user_id: row.userId,
  created_at: toIso(row.createdAt),
});

const mapNavigationPin = (row) => ({
  id: row.id,
  dataset_id: row.dataSetId,
  user_id: row.userId,
  collection_id: row.collectionId,
  type: row.type,
  name: row.name,
  icon: row.icon,
  media_type: row.mediaType,
  sort_order: row.order,
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updatedAt),
});

const mapAutoTagMapping = (row) => ({
  id: row.id,
  dataset_id: row.dataSetId,
  tag_id: row.tagId,
  auto_tag_key: row.autoTagKey,
  display_name: row.displayName,
  description: row.description,
  is_active: toBooleanInt(row.isActive),
  is_stop: toBooleanInt(row.isStop),
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updatedAt),
});

const mapAutoTagPrediction = (row) => ({
  id: row.id,
  asset_id: row.assetId,
  tags_json: toJsonText(row.tags, '[]'),
  scores_json: toJsonText(row.scores, '{}'),
  threshold: row.threshold,
  tag_count: row.tagCount,
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updatedAt),
});

const mapStackAutoTagAggregate = (row) => ({
  id: row.id,
  stack_id: row.stackId,
  aggregated_tags_json: toJsonText(row.aggregatedTags, '{}'),
  top_tags_json: toJsonText(row.topTags, '[]'),
  asset_count: row.assetCount,
  threshold: row.threshold,
  created_at: toIso(row.createdAt),
  updated_at: toIso(row.updatedAt),
});

const mapStackColor = (row) => ({
  id: row.id,
  stack_id: row.stackId,
  r: row.r,
  g: row.g,
  b: row.b,
  hex: row.hex,
  percentage: row.percentage,
  hue: row.hue,
  saturation: row.saturation,
  lightness: row.lightness,
  hue_category: row.hueCategory,
  order_index: row.orderIndex,
});

const mapAssetColor = (row) => ({
  id: row.id,
  asset_id: row.assetId,
  r: row.r,
  g: row.g,
  b: row.b,
  hex: row.hex,
  percentage: row.percentage,
  hue: row.hue,
  saturation: row.saturation,
  lightness: row.lightness,
  hue_category: row.hueCategory,
  order_index: row.orderIndex,
});

const finiteNumber = (value) => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeAutoTagKey = (tagKey) =>
  String(tagKey ?? '')
    .trim()
    .toLowerCase();

const scoreEntriesFromObject = (scores, options = {}) => {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return [];
  const entries = [];
  for (const [tagKey, value] of Object.entries(scores)) {
    const normalizedTagKey = normalizeAutoTagKey(tagKey);
    if (!normalizedTagKey) continue;
    if (options.allowedTagKeys && !options.allowedTagKeys.has(normalizedTagKey)) continue;
    const score = finiteNumber(value);
    if (score === null) continue;
    if (options.minScore !== undefined && score < options.minScore) continue;
    entries.push({ tag_key: tagKey, score });
  }
  entries.sort((left, right) => right.score - left.score);
  return options.limit ? entries.slice(0, options.limit) : entries;
};

const getEntryTagKey = (entry) => {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return '';
  return entry.tag ?? entry.tagKey ?? entry.key ?? entry.name ?? '';
};

const getEntryScore = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  return finiteNumber(entry.score ?? entry.value ?? entry.confidence ?? entry.probability);
};

const scoreEntriesFromTopTags = (topTags) => {
  if (!Array.isArray(topTags)) return [];
  return topTags
    .map((entry) => ({
      tag_key: getEntryTagKey(entry),
      score: getEntryScore(entry),
    }))
    .filter((entry) => entry.tag_key && entry.score !== null)
    .sort((left, right) => right.score - left.score);
};

const predictionTagKeySet = (tags) => {
  if (!Array.isArray(tags)) return new Set();
  return new Set(tags.map(getEntryTagKey).map(normalizeAutoTagKey).filter(Boolean));
};

const scoreEntriesFromPrediction = (prediction) => {
  const predictedTagKeys = predictionTagKeySet(prediction.tags);
  if (predictedTagKeys.size > 0) {
    return {
      entries: scoreEntriesFromObject(prediction.scores, { allowedTagKeys: predictedTagKeys }),
      sourceEntries: Object.keys(prediction.scores ?? {}).length,
    };
  }

  return {
    entries: scoreEntriesFromObject(prediction.scores, {
      minScore: MIN_EXPORTED_AUTO_TAG_SCORE,
      limit: MAX_FALLBACK_SCORE_ROWS_PER_PREDICTION,
    }),
    sourceEntries: Object.keys(prediction.scores ?? {}).length,
  };
};

const fileRecord = async ({ kind, datasetId: rowDatasetId, stackId, assetId, key }) => ({
  kind,
  dataset_id: rowDatasetId,
  stack_id: stackId,
  asset_id: assetId,
  key,
  normalized_key: normalizePathKey(key),
  ...(await verifyFileReference(key)),
});

const exportDefinitions = [
  {
    fileName: 'datasets.ndjson',
    query: (page) =>
      prisma.dataSet.findMany({ ...page, where: datasetWhere, orderBy: { id: 'asc' } }),
    map: mapDataset,
  },
  {
    fileName: 'users.ndjson',
    query: (page) => prisma.user.findMany({ ...page, orderBy: { id: 'asc' } }),
    map: mapUser,
  },
  {
    fileName: 'authors.ndjson',
    query: (page) =>
      prisma.author.findMany({ ...page, where: directDatasetWhere, orderBy: { id: 'asc' } }),
    map: mapAuthor,
  },
  {
    fileName: 'author_links.ndjson',
    query: queryAuthorLinks,
    map: mapAuthorLink,
  },
  {
    fileName: 'stacks.ndjson',
    query: (page) => prisma.stack.findMany({ ...page, where: stackWhere, orderBy: { id: 'asc' } }),
    map: mapStack,
  },
  {
    fileName: 'assets.ndjson',
    query: (page) => prisma.asset.findMany({ ...page, where: assetWhere, orderBy: { id: 'asc' } }),
    map: mapAsset,
  },
  {
    fileName: 'tags.ndjson',
    query: (page) =>
      prisma.tag.findMany({ ...page, where: directDatasetWhere, orderBy: { id: 'asc' } }),
    map: mapTag,
  },
  {
    fileName: 'stack_tags.ndjson',
    query: (page) =>
      prisma.tagsOnStack.findMany({
        ...page,
        where: datasetId ? { stack: { dataSetId: datasetId } } : {},
        orderBy: [{ stackId: 'asc' }, { tagId: 'asc' }],
      }),
    map: mapStackTag,
  },
  {
    fileName: 'collections.ndjson',
    query: (page) =>
      prisma.collection.findMany({ ...page, where: directDatasetWhere, orderBy: { id: 'asc' } }),
    map: mapCollection,
  },
  {
    fileName: 'collection_folders.ndjson',
    query: (page) =>
      prisma.collectionFolder.findMany({
        ...page,
        where: directDatasetWhere,
        orderBy: { id: 'asc' },
      }),
    map: mapCollectionFolder,
  },
  {
    fileName: 'collection_stacks.ndjson',
    query: (page) =>
      prisma.collectionStack.findMany({
        ...page,
        where: datasetId ? { collection: { dataSetId: datasetId } } : {},
        orderBy: [{ collectionId: 'asc' }, { stackId: 'asc' }],
      }),
    map: mapCollectionStack,
  },
  {
    fileName: 'stack_favorites.ndjson',
    query: (page) =>
      prisma.stackFavorite.findMany({
        ...page,
        where: datasetId ? { stack: { dataSetId: datasetId } } : {},
        orderBy: { id: 'asc' },
      }),
    map: mapStackFavorite,
  },
  {
    fileName: 'asset_favorites.ndjson',
    query: (page) =>
      prisma.assetFavorite.findMany({
        ...page,
        where: datasetId ? { asset: { stack: { dataSetId: datasetId } } } : {},
        orderBy: { id: 'asc' },
      }),
    map: mapAssetFavorite,
  },
  {
    fileName: 'like_activities.ndjson',
    query: (page) =>
      prisma.likeActivity.findMany({
        ...page,
        where: datasetId ? { stack: { dataSetId: datasetId } } : {},
        orderBy: { id: 'asc' },
      }),
    map: mapLikeActivity,
  },
  {
    fileName: 'navigation_pins.ndjson',
    query: (page) =>
      prisma.navigationPin.findMany({
        ...page,
        where: directDatasetWhere,
        orderBy: { id: 'asc' },
      }),
    map: mapNavigationPin,
  },
  {
    fileName: 'auto_tag_mappings.ndjson',
    query: (page) =>
      prisma.autoTagMapping.findMany({
        ...page,
        where: directDatasetWhere,
        orderBy: { id: 'asc' },
      }),
    map: mapAutoTagMapping,
  },
  {
    fileName: 'auto_tag_predictions.ndjson',
    query: (page) =>
      prisma.autoTagPrediction.findMany({
        ...page,
        where: datasetId ? { asset: { stack: { dataSetId: datasetId } } } : {},
        orderBy: { id: 'asc' },
      }),
    map: mapAutoTagPrediction,
  },
  {
    fileName: 'stack_auto_tag_aggregates.ndjson',
    query: (page) =>
      prisma.stackAutoTagAggregate.findMany({
        ...page,
        where: datasetId ? { stack: { dataSetId: datasetId } } : {},
        orderBy: { id: 'asc' },
      }),
    map: mapStackAutoTagAggregate,
  },
  {
    fileName: 'stack_colors.ndjson',
    query: (page) =>
      prisma.stackColor.findMany({
        ...page,
        where: datasetId ? { stack: { dataSetId: datasetId } } : {},
        orderBy: { id: 'asc' },
      }),
    map: mapStackColor,
  },
  {
    fileName: 'asset_colors.ndjson',
    query: (page) =>
      prisma.assetColor.findMany({
        ...page,
        where: datasetId ? { asset: { stack: { dataSetId: datasetId } } } : {},
        orderBy: { id: 'asc' },
      }),
    map: mapAssetColor,
  },
];

const exportAutoTagPredictionScores = () =>
  writeNdjson('auto_tag_prediction_scores.ndjson', async (write) => {
    let skip = 0;
    let scoreRows = 0;
    let sourceScoreRows = 0;
    for (;;) {
      const rows = await prisma.autoTagPrediction.findMany({
        skip,
        take: batchSize,
        where: datasetId ? { asset: { stack: { dataSetId: datasetId } } } : {},
        orderBy: { id: 'asc' },
        select: { id: true, assetId: true, tags: true, scores: true },
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        const { entries, sourceEntries } = scoreEntriesFromPrediction(row);
        sourceScoreRows += sourceEntries;
        for (const [index, entry] of entries.entries()) {
          await write({
            prediction_id: row.id,
            asset_id: row.assetId,
            tag_key: entry.tag_key,
            score: entry.score,
            rank: index + 1,
          });
          scoreRows += 1;
        }
      }
      skip += rows.length;
      console.log(
        `[standalone-export] auto_tag_prediction_scores.ndjson: ${skip} predictions / ${scoreRows} scores (${sourceScoreRows - scoreRows} skipped)...`
      );
    }
  });

const exportStackAutoTagScores = () =>
  writeNdjson('stack_auto_tag_scores.ndjson', async (write) => {
    let skip = 0;
    let scoreRows = 0;
    for (;;) {
      const rows = await prisma.stackAutoTagAggregate.findMany({
        skip,
        take: batchSize,
        where: datasetId ? { stack: { dataSetId: datasetId } } : {},
        orderBy: { id: 'asc' },
        select: {
          id: true,
          stackId: true,
          topTags: true,
          assetCount: true,
          threshold: true,
        },
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        const entries = scoreEntriesFromTopTags(row.topTags);
        for (const [index, entry] of entries.entries()) {
          await write({
            aggregate_id: row.id,
            stack_id: row.stackId,
            tag_key: entry.tag_key,
            score: entry.score,
            rank: index + 1,
            asset_count: row.assetCount,
            threshold: row.threshold,
          });
          scoreRows += 1;
        }
      }
      skip += rows.length;
      console.log(
        `[standalone-export] stack_auto_tag_scores.ndjson: ${skip} aggregates / ${scoreRows} scores...`
      );
    }
  });

const exportFiles = () =>
  writeNdjson('files.ndjson', async (write) => {
    let stackSkip = 0;
    for (;;) {
      const stacks = await prisma.stack.findMany({
        skip: stackSkip,
        take: batchSize,
        where: stackWhere,
        orderBy: { id: 'asc' },
        select: { id: true, dataSetId: true, thumbnail: true },
      });
      if (stacks.length === 0) break;
      for (const stack of stacks) {
        if (!stack.thumbnail) continue;
        await write(
          await fileRecord({
            kind: 'stack_thumbnail',
            datasetId: stack.dataSetId,
            stackId: stack.id,
            assetId: null,
            key: stack.thumbnail,
          })
        );
      }
      stackSkip += stacks.length;
      console.log(`[standalone-export] files.ndjson: ${stackSkip} stacks...`);
    }

    let assetSkip = 0;
    for (;;) {
      const assets = await prisma.asset.findMany({
        skip: assetSkip,
        take: batchSize,
        where: assetWhere,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          stackId: true,
          file: true,
          thumbnail: true,
          preview: true,
          stack: { select: { dataSetId: true } },
        },
      });
      if (assets.length === 0) break;
      for (const asset of assets) {
        const base = {
          datasetId: asset.stack.dataSetId,
          stackId: asset.stackId,
          assetId: asset.id,
        };
        if (asset.file) {
          await write(await fileRecord({ ...base, kind: 'asset_file', key: asset.file }));
        }
        if (asset.thumbnail) {
          await write(await fileRecord({ ...base, kind: 'asset_thumbnail', key: asset.thumbnail }));
        }
        if (asset.preview) {
          await write(await fileRecord({ ...base, kind: 'asset_preview', key: asset.preview }));
        }
      }
      assetSkip += assets.length;
      console.log(`[standalone-export] files.ndjson: ${assetSkip} assets...`);
    }
  });

const createManifest = async (files) => ({
  format: 'caramel-board-standalone-export',
  version: EXPORT_VERSION,
  generated_at: generatedAt.toISOString(),
  source: {
    app: 'caramel-board',
    prisma_client: prismaSource,
    database_url_present: Boolean(process.env.DATABASE_URL),
  },
  options: {
    dataset_id: datasetId ?? null,
    batch_size: batchSize,
    verify_files: verifyFiles,
    storage_root: verifyFiles ? storageRoot : null,
  },
  files,
});

const run = async () => {
  await ensureOutputDirectory();
  console.log(`[standalone-export] 出力先: ${outputRoot}`);
  console.log(`[standalone-export] Prisma client: ${prismaSource}`);
  if (datasetId) console.log(`[standalone-export] dataset: ${datasetId}`);
  if (verifyFiles) console.log(`[standalone-export] storage root: ${storageRoot}`);

  const files = [];

  for (const definition of exportDefinitions) {
    console.log(`[standalone-export] ${definition.fileName}`);
    files.push(await exportPaginated(definition));
  }

  console.log('[standalone-export] auto_tag_prediction_scores.ndjson');
  files.push(await exportAutoTagPredictionScores());

  console.log('[standalone-export] stack_auto_tag_scores.ndjson');
  files.push(await exportStackAutoTagScores());

  console.log('[standalone-export] files.ndjson');
  files.push(await exportFiles());

  const manifest = await createManifest(files);
  const manifestPath = path.join(outputRoot, 'manifest.json');
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log('[standalone-export] 完了');
  console.log(`[standalone-export] manifest: ${manifestPath}`);
};

try {
  await run();
} catch (error) {
  console.error('[standalone-export] 失敗しました');
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
