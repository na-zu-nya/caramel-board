import path from 'path';
import fs from 'fs';
import type {Asset} from '@prisma/client';
import urlJoin from 'url-join';
import {DataStorage} from '../lib/DataStorage';
import {getPrisma} from '../lib/Repository';
import {getAutoTagClient} from '../lib/AutoTagClient';
import {AutoTagService} from '../shared/services/AutoTagService';
import {ColorExtractor} from '../utils/colorExtractor';
import {getExtension, getFileType, getHash} from '../utils/functions';
import {generateThumbnail} from '../utils/generateThumbnail';
import {buildAssetKey, toPublicAssetPath} from '../utils/assetPath';
import {generateMediaPreview} from '../utils/generateMediaPreview';
import {StackModel} from './StackModel';
import { DuplicateAssetError } from '../errors/DuplicateAssetError';

const prisma = getPrisma();
const stacksAIClient = getAutoTagClient();
const autoTagService = new AutoTagService(prisma);

export class AssetModel {
  static async createWithFile(
    sourcePath: string,
    originalName: string,
    stackId: number,
    dataSetId = 1
  ): Promise<number> {
    console.log('Source', sourcePath);
    const id = await getHash(sourcePath);
    const ext = getFileType(originalName);
    console.log('src,type,ext', sourcePath, ext, getExtension(originalName));
    const key = buildAssetKey(dataSetId, id, ext);

    // Check duplicates across dataset (and within the same stack)
    const existing = await prisma.asset.findFirst({
      where: { hash: id, stack: { dataSetId } },
      select: { id: true, stackId: true },
    });

    if (existing) {
      // Clean up temp source if it still exists
      try { fs.rmSync(sourcePath); } catch {}
      if (existing.stackId === stackId) {
        throw new DuplicateAssetError('このスタックに同一画像が既に存在します', {
          assetId: existing.id,
          stackId: existing.stackId,
          scope: 'same-stack',
        });
      }
      throw new DuplicateAssetError('重複画像のため追加できません（別スタックに存在）', {
        assetId: existing.id,
        stackId: existing.stackId,
        scope: 'dataset',
      });
    }

    console.log('move:', key, sourcePath);
    await DataStorage.mkdir(path.dirname(key), dataSetId);
    DataStorage.move(key, sourcePath, dataSetId);

    let thumbnailKey = '';
    try {
      thumbnailKey = await generateThumbnail(key, ext, false, dataSetId);
      console.log('AssetModel.createWithFile:ThumbnailKey:', thumbnailKey);
    } catch (e) {
      console.error(e);
    }

    let previewKey: string | null = null;
    try {
      previewKey = await generateMediaPreview(key, id, ext, { dataSetId });
      if (previewKey) {
        console.log('AssetModel.createWithFile:PreviewKey:', previewKey);
      }
    } catch (error) {
      console.error('AssetModel.createWithFile: failed to generate preview', error);
    }

    // 画像や動画の場合、色を抽出
    let dominantColors = null;
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp') {
      // 画像の場合は元ファイルから抽出
      const localPath = DataStorage.getPath(key);
      dominantColors = await ColorExtractor.extractDominantColors(localPath, 3);
      console.log(`Extracted ${dominantColors.length} dominant colors from image`);
    } else if (
      (ext === 'mp4' || ext === 'mov' || ext === 'avi' || ext === 'mkv' || ext === 'webm') &&
      thumbnailKey
    ) {
      // 動画の場合はサムネイルから抽出
      try {
        const thumbnailPath = DataStorage.getPath(thumbnailKey);
        dominantColors = await ColorExtractor.extractDominantColors(thumbnailPath, 3);
        console.log(`Extracted ${dominantColors.length} dominant colors from video thumbnail`);
      } catch (error) {
        console.error(`Failed to extract colors from video thumbnail: ${error}`);
      }
    }

    // Determine next order in stack (append at end)
    const last = await prisma.asset.findFirst({
      where: { stackId },
      select: { orderInStack: true },
      orderBy: { orderInStack: 'desc' },
    });
    const nextOrder = (last?.orderInStack ?? -1) + 1;

    const asset = await prisma.asset.create({
      data: {
        file: key,
        originalName: originalName,
        thumbnail: thumbnailKey,
        preview: previewKey ?? null,
        fileType: ext,
        meta: {},
        stackId: stackId,
        hash: id,
        dominantColors: dominantColors || null,
        orderInStack: nextOrder,
      },
    });

    // If stack has no thumbnail yet, set it to this asset's thumbnail
    try {
      const stack = await prisma.stack.findUnique({ where: { id: stackId }, select: { thumbnail: true } });
      const currentThumb = stack?.thumbnail ?? '';
      if (!currentThumb && thumbnailKey) {
        await prisma.stack.update({ where: { id: stackId }, data: { thumbnail: thumbnailKey } });
      }
    } catch (e) {
      console.error('Failed to set stack thumbnail:', e);
    }

    // 画像の場合、バックグラウンドでJoyTag予測を実行し、スタックのAutoTagを更新
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp') {
      AssetModel.predictTagsAsync(asset.id, key)
        .then(async () => {
          // 個別アセットの予測後、スタック全体のAutoTagを集計
          try {
            console.log(`Aggregating AutoTags for stack ${stackId} after new asset upload`);
            await autoTagService.aggregateStackTags(stackId, 0.4);
            console.log(`Successfully aggregated AutoTags for stack ${stackId}`);
          } catch (error) {
            console.error(`Failed to aggregate AutoTags for stack ${stackId}:`, error);
          }
        })
        .catch((error) => {
          console.error(`Failed to predict tags for asset ${asset.id}:`, error);
        });
    }

    // スタックの代表色を更新
    if (dominantColors && dominantColors.length > 0) {
      AssetModel.updateStackColors(stackId).catch((error) => {
        console.error(`Failed to update stack colors for stack ${stackId}:`, error);
      });
    }

    return asset.id;
  }

  static async replaceFile(assetId: number, sourcePath: string, originalName: string) {
    const asset = await AssetModel.get(assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }
    console.log('replace');
    const stack = await StackModel.get(asset.stackId);

    const hash = await getHash(sourcePath);
    const fileType = getFileType(originalName);
    const file = buildAssetKey(stack.dataSetId, hash, fileType);

    // Move
    await DataStorage.mkdir(path.dirname(file), stack.dataSetId);
    DataStorage.move(file, sourcePath, stack.dataSetId);

    // Generate thumbnail
    let thumbnail = '';
    try {
      thumbnail = await generateThumbnail(file, fileType, false, stack.dataSetId);
    } catch (e) {
      console.error(e);
    }

    let preview: string | null = null;
    try {
      preview = await generateMediaPreview(file, hash, fileType, {
        dataSetId: stack.dataSetId,
        force: true,
      });
    } catch (error) {
      console.error('AssetModel.replaceFile: failed to regenerate preview', error);
    }

    const _asset = {
      ...asset,
      file,
      originalName,
      thumbnail,
      preview: preview ?? null,
      fileType,
      hash,
    };
    await prisma.asset.delete({ where: { id: _asset.id } });
    _asset.id = undefined;
    return prisma.asset.create({
      data: _asset,
    });
  }

  static async get(id: number) {
    return AssetModel.translate(
      (await prisma.asset.findUnique({
        where: {
          id,
        },
      })) as Asset
    );
  }

  static async updateOrder(id: number, order: number) {
    return prisma.asset.update({
      where: {
        id,
      },
      data: {
        orderInStack: order,
      },
    });
  }

  static async delete(id: number) {
    return prisma.asset.delete({
      where: {
        id,
      },
    });
  }

  static async updateMeta(id: number, meta: object) {
    return prisma.asset.update({
      where: {
        id,
      },
      data: {
        meta,
      },
    });
  }

  static translate(asset: Asset) {
    const cdnBase = process.env.CARAMELBOARD_CDN_URL || '/';
    const publicFile = toPublicAssetPath(asset.file);
    const publicThumbnail = toPublicAssetPath(asset.thumbnail);
    const publicPreview = toPublicAssetPath(asset.preview ?? '');

    const join = (value: string) => (cdnBase === '/' ? value : urlJoin(cdnBase, value));

    asset.file = publicFile ? join(publicFile) : '';
    asset.thumbnail = publicThumbnail ? join(publicThumbnail) : '';
    asset.preview = publicPreview ? join(publicPreview) : null;
    return asset;
  }

  static async predictTagsAsync(assetId: number, filePath: string, threshold = 0.4) {
    try {
      // AIサーバーが利用可能か確認
      await stacksAIClient.healthCheck();

      // 既存の予測があるかチェック
      const existingPrediction = await prisma.autoTagPrediction.findUnique({
        where: { assetId },
      });

      if (existingPrediction) {
        console.log(`Tags already predicted for asset ${assetId}`);
        return;
      }

      // キー部分のみを抽出（CDN URLを削除）
      const base = process.env.CARAMELBOARD_CDN_URL || '';
      const fileKey = base ? filePath.replace(base, '') : filePath;

      // AI予測を実行（キーのみを渡す）
      const prediction = await stacksAIClient.generateTags(fileKey, threshold);

      // 予測結果をデータベースに保存（競合に強い冪等処理）
      await prisma.autoTagPrediction.upsert({
        where: { assetId },
        create: {
          assetId,
          tags: prediction.predicted_tags,
          scores: prediction.scores,
          threshold,
          tagCount: prediction.tag_count,
        },
        update: {
          tags: prediction.predicted_tags,
          scores: prediction.scores,
          threshold,
          tagCount: prediction.tag_count,
        },
      });

      console.log(`Tags predicted for asset ${assetId}: ${prediction.tag_count} tags`);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`AI server not available for asset ${assetId}. Tags prediction skipped.`);
      } else if (error?.code === 'P2002') {
        // 一意制約違反（他プロセスが先に作成）。冪等のため情報ログのみ。
        console.log(`AutoTagPrediction already exists for asset ${assetId}; skipping create.`);
      } else {
        console.error(`Failed to predict tags for asset ${assetId}:`, error);
      }
      // エラーログを出力するが、アップロード処理は続行
    }
  }

  static async updateStackColors(stackId: number) {
    try {
      // スタックの全アセットを取得
      const assets = await prisma.asset.findMany({
        where: { stackId },
        select: { dominantColors: true },
      });

      // 色情報がないアセットを除外
      const assetColors = assets
        .filter((asset) => asset.dominantColors !== null)
        .map((asset) => asset.dominantColors as any);

      if (assetColors.length === 0) {
        console.log(`No color data found for stack ${stackId}`);
        return;
      }

      // スタックの代表色を集計
      const stackColors = ColorExtractor.aggregateStackColors(assetColors);

      // スタックを更新
      await prisma.stack.update({
        where: { id: stackId },
        data: { dominantColors: stackColors },
      });

      console.log(`Updated stack ${stackId} with ${stackColors.length} dominant colors`);
    } catch (error) {
      console.error(`Failed to update stack colors for stack ${stackId}:`, error);
    }
  }
}

export class PictureModel {
  static async create(
    sourcePath: string,
    fileType?: string,
    dataSetId = 1
  ) {
    const id = await getHash(sourcePath);
    const ext = (fileType ?? sourcePath.substr(sourcePath.lastIndexOf('.') + 1))
      .toLowerCase()
      .replace(/jpe?g/, 'jpg');
    const key = buildAssetKey(dataSetId, id, ext);
    DataStorage.move(key, sourcePath, dataSetId);

    return key;
  }
}
