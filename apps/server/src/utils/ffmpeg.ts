import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

type Candidate = string | undefined;

const pickExisting = (paths: Candidate[], fallback: string) => {
  for (const p of paths) {
    if (!p) continue;
    if (!p.includes('/') && !p.includes('\\')) return p;
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore and continue checking fallbacks
    }
  }
  return fallback;
};

export const getFFMPEGPath = () =>
  pickExisting(
    [process.env.FFMPEG_PATH, 'ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'],
    'ffmpeg'
  );

export const getFFPROBEPath = () =>
  pickExisting(
    [process.env.FFPROBE_PATH, 'ffprobe', '/usr/bin/ffprobe', '/usr/local/bin/ffprobe'],
    'ffprobe'
  );

export const probeDurationSec = (inputPath: string): number | null => {
  try {
    const bin = getFFPROBEPath();
    const out = execFileSync(
      bin,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ],
      { encoding: 'utf8' }
    ).trim();
    const dur = parseFloat(out);
    return Number.isFinite(dur) ? dur : null;
  } catch {
    return null;
  }
};

export const probeHasAudioStream = (inputPath: string): boolean => {
  try {
    const bin = getFFPROBEPath();
    const out = execFileSync(
      bin,
      [
        '-v',
        'error',
        '-select_streams',
        'a',
        '-show_entries',
        'stream=index',
        '-of',
        'csv=p=0',
        inputPath,
      ],
      { encoding: 'utf8' }
    ).trim();
    return out.length > 0;
  } catch {
    return false;
  }
};
