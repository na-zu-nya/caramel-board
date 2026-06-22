import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { mkdirpSync } from 'fs-extra';
import sharp from 'sharp';
import { DataStorage } from '../lib/DataStorage';
import { buildPreviewKey } from './assetPath';
import { getFFMPEGPath, probeHasAudioStream } from './ffmpeg';

const VIDEO_PREVIEW_EXTENSIONS = new Set(['gif', 'mov', 'mp4', 'avi', 'mkv', 'webm', 'm4v']);
const IMAGE_PREVIEW_EXTENSIONS = new Set(['svg', 'svgz']);
const VECTOR_PREVIEW_MAX_SIZE = 2048;
const VECTOR_PREVIEW_DENSITY = 192;

interface GeneratePreviewOptions {
  dataSetId?: number;
  force?: boolean;
}

const ensureEvenScale = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

const normalizeExtension = (ext: string) => ext.trim().replace(/^\./, '').toLowerCase();

const shouldGenerateVideoPreview = (ext: string) => VIDEO_PREVIEW_EXTENSIONS.has(ext);

const shouldGenerateImagePreview = (ext: string) => IMAGE_PREVIEW_EXTENSIONS.has(ext);

export const shouldGeneratePreview = (ext: string) => {
  const normalizedExt = normalizeExtension(ext);
  return shouldGenerateVideoPreview(normalizedExt) || shouldGenerateImagePreview(normalizedExt);
};

const generateImagePreview = async (
  fileKey: string,
  hash: string,
  dataSetId: number,
  force: boolean
) => {
  const previewKey = buildPreviewKey(dataSetId, hash, { extension: 'png' });
  const previewPath = DataStorage.getPath(previewKey);

  if (!force && DataStorage.exists(previewKey, dataSetId)) {
    return previewKey;
  }

  const inputPath = DataStorage.getPath(fileKey);
  mkdirpSync(path.dirname(previewPath));

  try {
    await sharp(inputPath, {
      density: VECTOR_PREVIEW_DENSITY,
      failOnError: false,
      sequentialRead: true,
    })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(VECTOR_PREVIEW_MAX_SIZE, VECTOR_PREVIEW_MAX_SIZE, {
        fit: 'inside',
        withoutEnlargement: false,
      })
      .png({ compressionLevel: 9 })
      .toFile(previewPath);

    if (!fs.existsSync(previewPath)) {
      return null;
    }
    return previewKey;
  } catch (error) {
    console.error('Failed to generate image preview via sharp', error);
    try {
      if (fs.existsSync(previewPath)) {
        fs.rmSync(previewPath);
      }
    } catch {}
    return null;
  }
};

export const generateMediaPreview = async (
  fileKey: string,
  hash: string,
  ext: string,
  options: GeneratePreviewOptions = {}
): Promise<string | null> => {
  const normalizedExt = normalizeExtension(ext);
  if (!shouldGeneratePreview(normalizedExt)) return null;

  const { dataSetId = 1, force = false } = options;
  if (shouldGenerateImagePreview(normalizedExt)) {
    return generateImagePreview(fileKey, hash, dataSetId, force);
  }

  const previewKey = buildPreviewKey(dataSetId, hash, { extension: 'mp4' });
  const previewPath = DataStorage.getPath(previewKey);

  if (!force && DataStorage.exists(previewKey, dataSetId)) {
    return previewKey;
  }

  const inputPath = DataStorage.getPath(fileKey);
  const ffmpeg = getFFMPEGPath();

  mkdirpSync(path.dirname(previewPath));

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    'faststart',
    '-force_key_frames',
    'expr:gte(t,n_forced*0.5)',
    '-vf',
    ensureEvenScale,
  ];

  const hasAudio = normalizedExt !== 'gif' && probeHasAudioStream(inputPath);
  if (hasAudio) {
    args.push('-c:a', 'aac', '-ac', '2', '-ar', '48000', '-b:a', '128k');
  } else {
    args.push('-an');
  }

  args.push(previewPath);

  try {
    execFileSync(ffmpeg, args, { stdio: 'ignore' });
    if (!fs.existsSync(previewPath)) {
      return null;
    }
    return previewKey;
  } catch (error) {
    console.error('Failed to generate media preview via ffmpeg', error);
    try {
      if (fs.existsSync(previewPath)) {
        fs.rmSync(previewPath);
      }
    } catch {}
    return null;
  }
};
