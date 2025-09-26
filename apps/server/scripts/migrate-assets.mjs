#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..', '..');

let prismaModule;
let prismaSource = '';
try {
  prismaSource = path.join(serverRoot, 'node_modules/@prisma/client/index.js');
  prismaModule = await import(prismaSource);
} catch (localError) {
  try {
    prismaSource = require.resolve('@prisma/client');
    prismaModule = await import(prismaSource);
  } catch (primaryError) {
    console.error('[migrate-assets] Failed to load @prisma/client');
    console.error('Local workspace error:', localError?.message);
    console.error('Root resolution error:', primaryError?.message);
    process.exit(1);
  }
}

const {PrismaClient} = prismaModule;
console.log(`[migrate-assets] prisma client source: ${prismaSource}`);

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);

const HASH_PREFIX_LENGTH = 2;
const args = process.argv.slice(2);
const storageArg = args.find((arg) => arg.startsWith('--storage-root='));
const explicitStorageRoot = storageArg ? storageArg.split('=')[1] : undefined;

const detectStorageRoot = () => {
  if (explicitStorageRoot) {
    return path.resolve(explicitStorageRoot);
  }
  if (process.env.FILES_STORAGE) {
    return path.resolve(process.env.FILES_STORAGE);
  }

  const candidates = [
    path.join(repoRoot, 'data/assets'),
    path.join(repoRoot, 'assets'),
    path.join(repoRoot, 'data'),
  ];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    try {
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // ignore and continue
    }
  }

  return path.resolve(path.join(repoRoot, 'data/assets'));
};

const storageRoot = detectStorageRoot();
console.log(`[migrate-assets] storage root: ${storageRoot}`);
const STORAGE_ROOT = 'library';
const LEGACY_ROOT = 'files';
const isDryRun = args.includes('--dry-run');
const datasetArg = args.find((arg) => arg.startsWith('--dataset='));
const targetDatasetId = datasetArg ? Number(datasetArg.split('=')[1]) : undefined;

if (Number.isNaN(targetDatasetId)) {
  console.error('[migrate-assets] --dataset must be a number');
  process.exit(1);
}

const sanitizeExtension = (ext) => ext.replace(/^\./, '').toLowerCase();
const normalizeHash = (hash) => hash.toLowerCase();
const hashPrefix = (hash) => {
  const normalized = normalizeHash(hash);
  const prefix = normalized.slice(0, HASH_PREFIX_LENGTH);
  return prefix || '00';
};

const hashRemainder = (hash) => {
  const normalized = normalizeHash(hash);
  const remainder = normalized.slice(HASH_PREFIX_LENGTH);
  return remainder || normalized;
};

const buildAssetKey = (dataSetId, hash, ext) => {
  const prefix = hashPrefix(hash);
  const extension = sanitizeExtension(ext);
  return `${STORAGE_ROOT}/${dataSetId}/assets/${prefix}/${normalizeHash(hash)}.${extension}`;
};

const buildThumbnailKey = (dataSetId, hash) => {
  const prefix = hashPrefix(hash);
  const remainder = hashRemainder(hash);
  return `${STORAGE_ROOT}/${dataSetId}/thumbnails/${prefix}/${remainder}.jpg`;
};

const stripCdnPrefix = (key) => {
  if (!key) return '';
  const withoutProtocol = key.replace(/^https?:\/\/[^/]+/i, '');
  return withoutProtocol.startsWith('/') ? withoutProtocol.slice(1) : withoutProtocol;
};

const normalizeKey = (key) => {
  const stripped = stripCdnPrefix(key);
  if (!stripped) return '';
  if (stripped.startsWith(`${STORAGE_ROOT}/`)) return stripped;
  if (stripped.startsWith(`${LEGACY_ROOT}/`)) return stripped;
  if (/^\d+\//.test(stripped)) return `${STORAGE_ROOT}/${stripped}`;
  return stripped;
};

const toFsPath = (key) => {
  const normalized = normalizeKey(key);
  if (!normalized) return '';
  return path.join(storageRoot, normalized);
};

const ensureDir = async (dir) => {
  if (!dir) return;
  await fsp.mkdir(dir, {recursive: true});
};

const existsKey = async (key) => {
  const target = toFsPath(key);
  if (!target) return false;
  try {
    await fsp.access(target, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const removeKeyIfExists = async (key) => {
  if (!key) return;
  if (isDryRun) return;
  if (!(await existsKey(key))) return;
  await fsp.unlink(toFsPath(key)).catch(() => {});
};

const moveFileKey = async (fromKey, toKey) => {
  if (fromKey === toKey) return false;
  const fromPath = toFsPath(fromKey);
  const toPath = toFsPath(toKey);
  if (!fromPath || !toPath) return false;

  try {
    await fsp.access(fromPath, fs.constants.F_OK);
  } catch {
    console.warn(`[migrate-assets] source missing: ${fromKey}`);
    return false;
  }

  if (isDryRun) {
    console.log(`[dry-run] move ${fromKey} -> ${toKey}`);
    return true;
  }

  await ensureDir(path.dirname(toPath));

  try {
    await fsp.rename(fromPath, toPath);
  } catch (error) {
    if (error.code === 'EXDEV') {
      await fsp.copyFile(fromPath, toPath);
      await fsp.unlink(fromPath);
    } else if (error.code === 'EEXIST') {
      // Destination already exists; keep destination and remove source
      await fsp.unlink(fromPath);
    } else {
      throw error;
    }
  }

  return true;
};

const getFileType = (ext) =>
  /(mov|mp4|m4v|avi|mkv|webm|mpeg|mpg|wmv)$/i.test(ext) ? 'movie' : 'image';

const ffmpegCandidates = () => {
  const fromEnv = process.env.FFMPEG_PATH;
  return [fromEnv, 'ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'].filter(Boolean);
};

const extractFrame = async (inputPath, outputPath) => {
  for (const candidate of ffmpegCandidates()) {
    try {
      await execFileAsync(candidate, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-ss',
        '1',
        '-frames:v',
        '1',
        outputPath,
      ]);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
    }
  }
  return false;
};

const generateThumbnail = async (fileKey, fileType, thumbnailKey) => {
  if (isDryRun) {
    console.log(`[dry-run] generate thumbnail for ${fileKey} -> ${thumbnailKey}`);
    return;
  }

  const inputPath = toFsPath(fileKey);
  const outputPath = toFsPath(thumbnailKey);
  if (!inputPath || !outputPath) return;

  await ensureDir(path.dirname(outputPath));

  const type = getFileType(fileType);

  if (type === 'image') {
    await sharp(inputPath, {failOnError: false, sequentialRead: true})
      .rotate()
      .flatten({background: '#ffffff'})
      .resize(320, 320, {fit: 'cover'})
      .jpeg({quality: 80})
      .toFile(outputPath);
    return;
  }

  const tmpPath = `${outputPath}.frame.jpg`;
  const extracted = await extractFrame(inputPath, tmpPath);
  if (!extracted) {
    console.warn(`[migrate-assets] ffmpeg failed for ${fileKey}`);
    return;
  }

  try {
    await sharp(tmpPath)
      .resize(320, 320, {fit: 'cover'})
      .jpeg({quality: 80})
      .toFile(outputPath);
  } finally {
    await fsp.unlink(tmpPath).catch(() => {});
  }
};

const stats = {
  assetsProcessed: 0,
  filesMoved: 0,
  thumbnailsGenerated: 0,
  assetsUpdated: 0,
  stacksUpdated: 0,
  missingFiles: 0,
};

const migrateAssets = async () => {
  const assets = await prisma.asset.findMany({
    where: targetDatasetId ? { stack: { dataSetId: targetDatasetId } } : undefined,
    include: {
      stack: {
        select: {
          id: true,
          dataSetId: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  for (const asset of assets) {
    stats.assetsProcessed += 1;
    const dataSetId = asset.stack.dataSetId;
    const newFileKey = buildAssetKey(dataSetId, asset.hash, asset.fileType);
    const newThumbnailKey = buildThumbnailKey(dataSetId, asset.hash);
    const currentFileKey = normalizeKey(asset.file);
    const currentThumbnailKey = normalizeKey(asset.thumbnail);

    const moved = currentFileKey && currentFileKey !== newFileKey
      ? await moveFileKey(currentFileKey, newFileKey)
      : false;

    if (moved) {
      stats.filesMoved += 1;
    }

    const fileExists = await existsKey(newFileKey);
    if (!fileExists) {
      console.warn(`[migrate-assets] file missing for asset ${asset.id}: ${newFileKey}`);
      stats.missingFiles += 1;
      continue;
    }

    await generateThumbnail(newFileKey, asset.fileType, newThumbnailKey);
    if (!isDryRun) {
      stats.thumbnailsGenerated += 1;
    }

    if (currentThumbnailKey && currentThumbnailKey !== newThumbnailKey) {
      await removeKeyIfExists(currentThumbnailKey);
    }

    if (
      currentFileKey !== newFileKey ||
      currentThumbnailKey !== newThumbnailKey
    ) {
      if (isDryRun) {
        console.log(`{${asset.id}} file: ${currentFileKey} -> ${newFileKey}`);
        console.log(`{${asset.id}} thumb: ${currentThumbnailKey} -> ${newThumbnailKey}`);
      } else {
        await prisma.asset.update({
          where: { id: asset.id },
          data: {
            file: newFileKey,
            thumbnail: newThumbnailKey,
          },
        });
        stats.assetsUpdated += 1;
      }
    }
  }
};

const updateStackThumbnails = async () => {
  const stacks = await prisma.stack.findMany({
    where: targetDatasetId ? { dataSetId: targetDatasetId } : undefined,
    include: {
      assets: {
        orderBy: { orderInStack: 'asc' },
        select: { thumbnail: true },
      },
    },
  });

  for (const stack of stacks) {
    const expected = stack.assets[0]?.thumbnail ?? '';
    if (stack.thumbnail !== expected) {
      if (isDryRun) {
        console.log(`[dry-run] stack ${stack.id} thumbnail ${stack.thumbnail} -> ${expected}`);
      } else {
        await prisma.stack.update({
          where: { id: stack.id },
          data: { thumbnail: expected },
        });
        stats.stacksUpdated += 1;
      }
    }
  }
};

const main = async () => {
  console.log('[migrate-assets] starting');
  if (isDryRun) console.log('[migrate-assets] dry run mode');
  if (targetDatasetId) console.log(`[migrate-assets] limiting to dataset ${targetDatasetId}`);

  await migrateAssets();
  await updateStackThumbnails();

  console.log('[migrate-assets] done');
  console.table(stats);
};

main()
  .catch((error) => {
    console.error('[migrate-assets] failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
