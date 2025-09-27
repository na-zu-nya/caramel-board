import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'fs-extra';
import { DataStorage } from '../lib/DataStorage';
import { buildPreviewKey } from './assetPath';
import { getFFMPEGPath, probeHasAudioStream } from './ffmpeg';

const SUPPORTED_EXTENSIONS = new Set(['gif', 'mov', 'mp4', 'avi', 'mkv', 'webm', 'm4v']);

interface GeneratePreviewOptions {
  dataSetId?: number;
  force?: boolean;
}

const ensureEvenScale = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

export const shouldGeneratePreview = (ext: string) => SUPPORTED_EXTENSIONS.has(ext);

export const generateMediaPreview = async (
  fileKey: string,
  hash: string,
  ext: string,
  options: GeneratePreviewOptions = {}
): Promise<string | null> => {
  if (!shouldGeneratePreview(ext)) return null;

  const { dataSetId = 1, force = false } = options;
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

  const hasAudio = ext !== 'gif' && probeHasAudioStream(inputPath);
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
