import type { PrismaClient } from '@prisma/client';
import { AssetModel } from '../../../models/AssetModel';
import type { DataStorageService } from '../../../shared/services/DataStorageService';
import {
  withPublicAssetArray,
  withPublicAssetPaths,
  toPublicAssetPath,
} from '../../../utils/assetPath';

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export const createAssetService = (deps: {
  prisma: PrismaClient;
  dataStorage: DataStorageService;
  dataSetId: number;
}) => {
  const { prisma, dataStorage, dataSetId } = deps;

  const refreshStackThumbnail = async (stackId: number) => {
    const topAsset = await prisma.asset.findFirst({
      where: { stackId },
      orderBy: { orderInStack: 'asc' },
    });

    const nextThumbnail = topAsset?.thumbnail ?? '';
    await prisma.stack.update({
      where: { id: stackId },
      data: { thumbnail: nextThumbnail },
    });
  };

  const mapAsset = <T extends { file?: string | null; thumbnail?: string | null; stack?: any }>(
    asset: T
  ) => {
    const mapped = withPublicAssetPaths(asset, dataSetId);
    if (mapped.stack) {
      mapped.stack = {
        ...mapped.stack,
        thumbnail: toPublicAssetPath(mapped.stack.thumbnail, mapped.stack.dataSetId ?? dataSetId),
      };
    }
    return mapped;
  };

  const mapAssets = <T extends { file?: string | null; thumbnail?: string | null }>(assets: T[]) =>
    withPublicAssetArray(assets, dataSetId).map((asset) => mapAsset(asset));

  return {
    // Get all assets for this dataset
    async getAll(pagination: PaginationOptions) {
      const { limit, offset } = pagination;

      const [assetsRaw, total] = await Promise.all([
        prisma.asset.findMany({
          where: {
            stack: { dataSetId },
          },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            stack: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
        prisma.asset.count({
          where: {
            stack: { dataSetId },
          },
        }),
      ]);

      const assets = mapAssets(assetsRaw);

      return {
        assets,
        total,
        limit,
        offset,
      };
    },

    async getById(id: number) {
      const asset = await prisma.asset.findUnique({
        where: { id },
        include: {
          stack: {
            select: {
              id: true,
              name: true,
              dataSetId: true,
            },
          },
        },
      });

      // Verify the asset belongs to this dataset
      if (asset && asset.stack.dataSetId !== dataSetId) {
        throw new Error('Asset not found in this dataset');
      }

      return asset ? mapAsset(asset) : null;
    },

    async delete(id: number) {
      // Verify the asset belongs to this dataset
      const asset = await this.getById(id);
      if (!asset) {
        throw new Error('Asset not found');
      }

      // Delete the physical files
      if (asset.file) {
        await dataStorage.deleteFile(asset.file);
      }
      if (asset.thumbnail) {
        await dataStorage.deleteFile(asset.thumbnail);
      }
      if (asset.preview) {
        await dataStorage.deleteFile(asset.preview);
      }

      const deleted = await prisma.asset.delete({
        where: { id },
      });

      await refreshStackThumbnail(asset.stackId);

      return mapAsset(deleted);
    },

    async getByStackId(stackId: number) {
      // Verify the stack belongs to this dataset
      const stack = await prisma.stack.findUnique({
        where: { id: stackId },
        select: { dataSetId: true },
      });

      if (!stack || stack.dataSetId !== dataSetId) {
        throw new Error('Stack not found in this dataset');
      }

      const assets = await prisma.asset.findMany({
        where: { stackId },
        orderBy: { orderInStack: 'asc' },
      });

      return mapAssets(assets);
    },

    async createWithFile(
      stackId: number,
      file: {
        path: string;
        originalname: string;
        mimetype: string;
        size: number;
      }
    ) {
      // Get stack to verify dataset ownership
      const stack = await prisma.stack.findUnique({
        where: { id: stackId },
      });

      if (!stack) {
        throw new Error('Stack not found');
      }

      if (stack.dataSetId !== dataSetId) {
        throw new Error('Stack not found in this dataset');
      }

      // Create asset using AssetModel
      const assetId = await AssetModel.createWithFile(
        file.path,
        file.originalname,
        stackId,
        dataSetId
      );

      await refreshStackThumbnail(stackId);

      // Return the created asset
      return this.getById(assetId);
    },

    async updateMeta(id: number, meta: Record<string, unknown>) {
      // Verify the asset belongs to this dataset
      await this.getById(id);

      const updated = await prisma.asset.update({
        where: { id },
        data: { meta: meta as any }, // Prisma requires JsonValue type
      });

      return mapAsset(updated);
    },

    async updateOrder(id: number, order: number) {
      // Verify the asset belongs to this dataset
      await this.getById(id);

      const updated = await prisma.asset.update({
        where: { id },
        data: { orderInStack: order },
      });

      await refreshStackThumbnail(updated.stackId);

      return mapAsset(updated);
    },

    async replaceFile(id: number, filePath: string, originalName: string) {
      // Verify the asset belongs to this dataset
      await this.getById(id);

      // Use AssetModel to replace the file
      const updated = await AssetModel.replaceFile(id, filePath, originalName);

      await refreshStackThumbnail(updated.stackId);

      return mapAsset(updated);
    },

    // Additional dataset-scoped methods
    async getRecentAssets(limit = 10) {
      const assets = await prisma.asset.findMany({
        where: {
          stack: { dataSetId },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          stack: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return mapAssets(assets);
    },

    async getAssetsByType(fileType: string) {
      const assets = await prisma.asset.findMany({
        where: {
          fileType,
          stack: { dataSetId },
        },
        include: {
          stack: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return mapAssets(assets);
    },

    async countByType() {
      const counts = await prisma.asset.groupBy({
        by: ['fileType'],
        where: {
          stack: { dataSetId },
        },
        _count: true,
      });

      return counts.map((c) => ({
        fileType: c.fileType,
        count: c._count,
      }));
    },
  };
};
