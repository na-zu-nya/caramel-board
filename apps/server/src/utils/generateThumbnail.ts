import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { mkdirpSync } from 'fs-extra';
import sharp from 'sharp';
import { DataStorage } from '../lib/DataStorage';
import { buildThumbnailKey } from './assetPath';
import { getFFMPEGPath, probeDurationSec } from './ffmpeg';

const THUMBNAIL_SIZE = 512;
const THUMBNAIL_QUALITY = 70;

interface GenerateThumbnailOptions {
  outputKey?: string;
  videoTimeSeconds?: number;
}

function getFileType(ext: string): 'movie' | 'image' {
  return /(mov|mp4|m4v|avi|mkv|webm|mpeg|mpg|wmv)$/i.test(ext) ? 'movie' : 'image';
}

const formatVideoSeekTime = (timeSeconds: number, duration: number | null) => {
  const safeTime = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
  const maxTime = duration !== null ? Math.max(0, duration - 0.001) : safeTime;
  return Math.min(safeTime, maxTime).toFixed(3);
};

export async function generateThumbnail(
  fileKey: string,
  ext: string,
  forceUpdate = false,
  dataSetId = 1,
  options: GenerateThumbnailOptions = {}
) {
  console.log('generateThumbnail:fileKey', fileKey);

  const key =
    options.outputKey ??
    buildThumbnailKey(dataSetId, await DataStorage.getHash(fileKey, dataSetId));
  const type = getFileType(ext);

  if (!forceUpdate && DataStorage.exists(key, dataSetId)) {
    return key;
  }

  if (type === 'image') {
    console.log('thumbnail: image');
    const outputPath = DataStorage.getPath(key);
    // 出力ディレクトリを確実に作成
    mkdirpSync(path.dirname(outputPath));

    const inputPath = DataStorage.getPath(fileKey);
    try {
      await sharp(inputPath, { failOnError: false, sequentialRead: true })
        .rotate() // EXIF Orientation 対応
        .flatten({ background: '#ffffff' }) // 透過を白で潰す（ある場合）
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' })
        .jpeg({ quality: THUMBNAIL_QUALITY })
        .toFile(outputPath);
    } catch (e) {
      console.warn(
        'sharp failed; falling back via ffmpeg transcode',
        e instanceof Error ? e.message : e
      );
      // 破損JPEGなどの救済: ffmpeg でJPEGにデコードしてから sharp でサムネ生成
      const tmpKey = `${key}.fallback.jpg`;
      const tmpPath = DataStorage.getPath(tmpKey);
      mkdirpSync(path.dirname(tmpPath));
      const ff = getFFMPEGPath();
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-frames:v',
        '1',
        tmpPath,
      ];
      try {
        execFileSync(ff, args, { stdio: 'ignore' });
        await sharp(tmpPath)
          .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' })
          .jpeg({ quality: THUMBNAIL_QUALITY })
          .toFile(outputPath);
      } finally {
        try {
          await DataStorage.delete(tmpKey, dataSetId);
        } catch {}
      }
    }
  } else if (type === 'movie') {
    console.log('thumbnail: movie');
    const frameKey = `${key}.frame.jpg`;
    const framePath = DataStorage.getPath(frameKey);
    const inputPath = DataStorage.getPath(fileKey);
    mkdirpSync(path.dirname(framePath));

    // 1秒以上の動画は t=1s のフレーム、それ未満は2フレーム目を抽出
    const duration = probeDurationSec(inputPath);
    const isShort = duration !== null ? duration < 1 : false;
    const hasRequestedTime = options.videoTimeSeconds !== undefined;

    const args = hasRequestedTime
      ? [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          inputPath,
          '-ss',
          formatVideoSeekTime(options.videoTimeSeconds ?? 0, duration),
          '-frames:v',
          '1',
          framePath,
        ]
      : isShort
        ? [
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            inputPath,
            '-vf',
            'select=eq(n,1)',
            '-frames:v',
            '1',
            framePath,
          ]
        : [
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            inputPath,
            '-ss',
            '1',
            '-frames:v',
            '1',
            framePath,
          ];

    const ff = getFFMPEGPath();
    console.log(ff, args.join(' '));
    try {
      execFileSync(ff, args, { stdio: 'ignore' });
    } catch (_error) {
      // 失敗時に候補パスでもう一度だけ試行
      const candidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
      for (const c of candidates) {
        if (c === ff) continue;
        try {
          execFileSync(c, args, { stdio: 'ignore' });
          console.log('ffmpeg fallback succeeded with', c);
          break;
        } catch {
          // continue
        }
      }
    }
    const outputPath = DataStorage.getPath(key);
    // 出力ディレクトリを確実に作成
    mkdirpSync(path.dirname(outputPath));
    await sharp(framePath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
      })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toFile(outputPath);
    await DataStorage.delete(frameKey, dataSetId);
  }
  return key;
}
