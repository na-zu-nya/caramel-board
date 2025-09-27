import { execFileSync } from 'node:child_process';
import { mkdirpSync } from 'fs-extra';
import path from 'node:path';
import sharp from 'sharp';
import { DataStorage } from '../lib/DataStorage';
import { buildThumbnailKey } from './assetPath';
import { getFFMPEGPath, probeDurationSec } from './ffmpeg';

function getFileType(ext: string): 'movie' | 'image' {
  return /(mov|mp4|m4v|avi|mkv|webm|mpeg|mpg|wmv)$/i.test(ext) ? 'movie' : 'image';
}

export async function generateThumbnail(
  fileKey: string,
  ext: string,
  forceUpdate = false,
  dataSetId = 1
) {
  console.log('generateThumbnail:fileKey', fileKey);

  const digest = await DataStorage.getHash(fileKey, dataSetId);
  const key = buildThumbnailKey(dataSetId, digest);
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
        .resize(320, 320, { fit: 'cover' })
        .jpeg({ quality: 80 })
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
          .resize(320, 320, { fit: 'cover' })
          .jpeg({ quality: 80 })
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
    const inputPath = DataStorage.getPath(fileKey);

    // 1秒以上の動画は t=1s のフレーム、それ未満は2フレーム目を抽出
    const duration = probeDurationSec(inputPath);
    const isShort = duration !== null ? duration < 1 : false;

    const args = isShort
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
          DataStorage.getPath(frameKey),
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
          DataStorage.getPath(frameKey),
        ];

    const ff = getFFMPEGPath();
    console.log(ff, args.join(' '));
    try {
      execFileSync(ff, args, { stdio: 'ignore' });
    } catch (e) {
      // 失敗時に候補パスでもう一度だけ試行
      const candidates = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
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
    await sharp(DataStorage.getPath(frameKey))
      .resize(320, 320, {
        fit: 'cover',
      })
      .jpeg({ quality: 80 })
      .toFile(outputPath);
    await DataStorage.delete(frameKey, dataSetId);
  }
  return key;
}
