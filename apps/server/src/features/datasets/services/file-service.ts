import { execSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { mkdirpSync } from 'fs-extra';
import sharp from 'sharp';
import type { DataStorageService } from '../../../shared/services/DataStorageService';
import { buildThumbnailKey } from '../../../utils/assetPath';

function getFFMPEGPath() {
  return process.env.FFMPEG_PATH;
}

function getFileType(ext: string): 'movie' | 'image' {
  return ext.match(/mov|mp4/) ? 'movie' : 'image';
}

export const createFileService = (deps: {
  prisma: PrismaClient;
  dataStorage: DataStorageService;
}) => {
  const { prisma, dataStorage } = deps;

  return {
    async generateThumbnailFromAsset(
      assetId: number,
      dataSetId: number,
      width = 320,
      height = 320
    ): Promise<string> {
      // アセット情報を取得
      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
      });

      if (!asset) {
        throw new Error('Asset not found');
      }

      const digest = await dataStorage.getHash(asset.file, dataSetId);
      const key = buildThumbnailKey(dataSetId, digest);
      const type = getFileType(asset.fileType);

      // 既存のサムネイルがあれば返す
      if (dataStorage.exists(key, dataSetId)) {
        return key;
      }

      if (type === 'image') {
        console.log('thumbnail: image');
        const outputPath = dataStorage.getPath(key);
        // 出力ディレクトリを確実に作成
        mkdirpSync(path.dirname(outputPath));

        await sharp(dataStorage.getPath(asset.file))
          .removeAlpha()
          .resize(width, height, {
            fit: 'cover',
          })
          .jpeg({ quality: 80 })
          .toFile(outputPath);
      } else if (type === 'movie') {
        console.log('thumbnail: movie');
        const tmpKey = `${key}.frame.jpg`;
        const cmd = [
          getFFMPEGPath(),
          '-i',
          dataStorage.getPath(asset.file),
          '-vf',
          `thumbnail,scale=${width}:${height}`,
          '-frames:v',
          '1',
          '-y',
          dataStorage.getPath(tmpKey),
        ];
        const outputPath = dataStorage.getPath(key);
        mkdirpSync(path.dirname(outputPath));
        execSync(cmd.filter(Boolean).join(' '));

        await sharp(dataStorage.getPath(tmpKey)).jpeg({ quality: 80 }).toFile(outputPath);

        // 一時ファイルを削除
        await dataStorage.delete(tmpKey, dataSetId);
      }

      return key;
    },

    async refreshStackThumbnail(stackId: number, dataSetId: number): Promise<string> {
      const stack = await prisma.stack.findUnique({
        where: { id: stackId },
        include: {
          assets: {
            orderBy: { orderInStack: 'asc' },
            take: 1,
          },
        },
      });

      if (!stack || stack.assets.length === 0) {
        throw new Error('Stack or assets not found');
      }

      const firstAsset = stack.assets[0];
      const thumbnailPath = await this.generateThumbnailFromAsset(
        firstAsset.id,
        dataSetId,
        300,
        300
      );

      // Stackのサムネイルパスを更新
      await prisma.stack.update({
        where: { id: stackId },
        data: { thumbnail: thumbnailPath },
      });

      return thumbnailPath;
    },

    // ファイルの存在確認
    exists(filePath: string, dataSetId: number): boolean {
      return dataStorage.exists(filePath, dataSetId);
    },

    // ファイルパスの取得
    getPath(filePath: string): string {
      return dataStorage.getPath(filePath);
    },

    // ファイルのハッシュ値取得
    async getHash(filePath: string, dataSetId: number): Promise<string> {
      return dataStorage.getHash(filePath, dataSetId);
    },
  };
};
