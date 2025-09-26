import { execSync } from 'child_process';
import { createStreamDigest } from '../utils/createDigest';
import { buildThumbnailKey } from '../utils/assetPath';
import { DataStorage } from './DataStorage';

export interface ImageInfo {
  type: string;
  width: number;
  height: number;
  bit: string;
  colorSpace: string;
  size: number;
}

export class ImageConverter {
  static getInfo(key: string): ImageInfo {
    const data = execSync(`identify ${DataStorage.getPath(key)}`)
      .toString()
      .trimEnd();
    const info = data.split(' ');
    const size = info[2].split('x').map((item) => +item);
    const fileSize = +info[6].slice(0, -1);

    return {
      bit: info[4],
      colorSpace: info[5],
      width: size[0],
      height: size[1],
      size: fileSize,
      type: info[1],
    };
  }

  static async createThumbnail(key: string, size: number, isVideo = false) {
    const stream = DataStorage.getStream(key);
    const digest = await createStreamDigest(stream);

    const info = ImageConverter.getInfo(key);
    const path = DataStorage.getPath(key);
    const match = key.match(/^files\/(\d+)\//);
    const dataSetId = match ? Number(match[1]) : 1;
    const thumbnailKey = buildThumbnailKey(dataSetId, digest);
    const outputPath = DataStorage.getPath(thumbnailKey);

    const rs = { width: info.width, height: info.height };
    if (info.width > info.height) {
      rs.width = info.width / (info.height / size);
      rs.height = size;
    } else {
      rs.width = size;
      rs.height = info.height / (info.width / size);
    }

    if (isVideo) {
      void 0;
    } else {
      execSync(
        `convert -resize ${rs.width}x${rs.height} -gravity center -crop ${size}x${size}+0+0 "${path}" "${outputPath}"`,
        { stdio: 'inherit' }
      );
    }

    return thumbnailKey;
  }
}
