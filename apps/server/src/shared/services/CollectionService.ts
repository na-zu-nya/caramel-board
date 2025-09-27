import { type Collection, Prisma, type PrismaClient } from '@prisma/client';
import type {
  CollectionQuery,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '../../models/CollectionModel';
import type { FilterConfig } from '../../utils/filterBuilder';
import { createColorSearchService } from '../../features/datasets/services/color-search-service';
import {
  createSearchService,
  SearchMode,
  type SearchFilters,
  type SortOptions,
} from '../../features/datasets/services/search-service';
import { createTagStatsService } from '../../features/datasets/services/tag-stats-service';
import { toPublicAssetPath, withPublicAssetArray } from '../../utils/assetPath';

export class CollectionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Helper to resolve folder (for auth)
  // Optional method used by routes when query contains folderId but no datasetId
  async findFolderById(folderId: number) {
    // @ts-ignore - access prisma through this.prisma
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.collectionFolder.findUnique({ where: { id: folderId } });
  }

  async create(data: CreateCollectionInput): Promise<Collection> {
    return this.prisma.collection.create({
      data: {
        name: data.name,
        icon: data.icon || '📂',
        description: data.description,
        type: data.type || 'MANUAL',
        dataSetId: data.dataSetId,
        folderId: data.folderId || null,
        filterConfig: data.filterConfig || Prisma.JsonNull,
      },
      include: {
        dataSet: true,
        folder: true,
        _count: {
          select: {
            collectionStacks: true,
          },
        },
      },
    });
  }

  async findAll(query: CollectionQuery) {
    const where: Prisma.CollectionWhereInput = {};

    if (query.dataSetId) {
      where.dataSetId = query.dataSetId;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.folderId !== undefined) {
      where.folderId = query.folderId || null;
    }

    const [collections, total] = await Promise.all([
      this.prisma.collection.findMany({
        where,
        include: {
          dataSet: true,
          folder: true,
          _count: {
            select: {
              collectionStacks: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.collection.count({ where }),
    ]);

    return {
      collections,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findById(id: number): Promise<Collection | null> {
    return this.prisma.collection.findUnique({
      where: { id },
      include: {
        dataSet: true,
        folder: true,
        collectionStacks: {
          include: {
            stack: {
              include: {
                author: true,
                tags: {
                  include: {
                    tag: true,
                  },
                },
              },
            },
          },
          orderBy: {
            orderIndex: 'asc',
          },
        },
        _count: {
          select: {
            collectionStacks: true,
          },
        },
      },
    });
  }

  async update(id: number, data: UpdateCollectionInput): Promise<Collection> {
    // Build update payload conditionally to avoid passing undefined properties
    const updateData: Prisma.CollectionUpdateInput = {
      updatedAt: new Date(),
    } as Prisma.CollectionUpdateInput;

    if (data.name !== undefined) updateData.name = data.name;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type as any;
    // Allow null to move to root
    if (data.folderId !== undefined) updateData.folderId = data.folderId as number | null;
    if (data.filterConfig !== undefined)
      updateData.filterConfig = data.filterConfig as Prisma.JsonValue;

    return this.prisma.collection.update({
      where: { id },
      data: updateData,
      include: {
        dataSet: true,
        folder: true,
        _count: {
          select: {
            collectionStacks: true,
          },
        },
      },
    });
  }

  async delete(id: number): Promise<Collection> {
    // CollectionStackは CASCADE削除されるため、Collectionを削除するだけでOK
    return this.prisma.collection.delete({
      where: { id },
    });
  }

  async addStackToCollection(
    collectionId: number,
    stackId: number,
    orderIndex?: number
  ): Promise<void> {
    // 既存のスタックが存在するかチェック
    const existing = await this.prisma.collectionStack.findUnique({
      where: {
        collectionId_stackId: {
          collectionId,
          stackId,
        },
      },
    });

    if (existing) {
      throw new Error('スタックは既にコレクションに追加されています');
    }

    // orderIndexが指定されていない場合は最後に追加
    if (orderIndex === undefined) {
      const maxOrder = await this.prisma.collectionStack.findFirst({
        where: { collectionId },
        orderBy: { orderIndex: 'desc' },
      });
      orderIndex = (maxOrder?.orderIndex || 0) + 1;
    }

    await this.prisma.collectionStack.create({
      data: {
        collectionId,
        stackId,
        orderIndex,
      },
    });
  }

  async removeStackFromCollection(collectionId: number, stackId: number): Promise<void> {
    await this.prisma.collectionStack.delete({
      where: {
        collectionId_stackId: {
          collectionId,
          stackId,
        },
      },
    });
  }

  async reorderStacksInCollection(
    collectionId: number,
    stackOrders: { stackId: number; orderIndex: number }[]
  ): Promise<void> {
    // トランザクション内で順序を更新
    await this.prisma.$transaction(async (prisma) => {
      for (const { stackId, orderIndex } of stackOrders) {
        await prisma.collectionStack.update({
          where: {
            collectionId_stackId: {
              collectionId,
              stackId,
            },
          },
          data: {
            orderIndex,
          },
        });
      }
    });
  }

  // スマートコレクション用：フィルタ条件に基づいてスタックを取得
  async getStacksByFilter(collectionId: number, limit = 50, offset = 0) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection || collection.type !== 'SMART' || !collection.filterConfig) {
      throw new Error('無効なスマートコレクションです');
    }

    const filterConfig = collection.filterConfig as FilterConfig & {
      // extend: client may store names rather than IDs
      search?: string;
      authorNames?: string[];
      tagIds?: string[];
      hasNoTags?: boolean;
      hasNoAuthor?: boolean;
      colorFilter?: any;
      mediaType?: 'image' | 'comic' | 'video';
      favorited?: boolean;
      liked?: boolean;
    };

    // Create dataset-scoped services
    const colorSearch = createColorSearchService({
      prisma: this.prisma,
      dataSetId: collection.dataSetId,
    });
    const tagStats = createTagStatsService({
      prisma: this.prisma,
      dataSetId: collection.dataSetId,
    });
    const searchService = createSearchService({
      prisma: this.prisma,
      colorSearch,
      tagStats,
      dataSetId: collection.dataSetId,
    });

    // Map FilterConfig -> SearchFilters
    const filters: SearchFilters = {};
    if (filterConfig.mediaType) filters.mediaType = filterConfig.mediaType;
    if (filterConfig.favorited !== undefined) {
      filters.favorites = filterConfig.favorited ? 'is-fav' : 'not-fav';
    }
    if (filterConfig.liked !== undefined) {
      filters.likes = filterConfig.liked ? 'is-liked' : 'not-liked';
    }
    if (Array.isArray(filterConfig.tagIds) && filterConfig.tagIds.length > 0) {
      filters.tags = { includeAny: filterConfig.tagIds };
    }
    if (Array.isArray(filterConfig.authorNames) && filterConfig.authorNames.length > 0) {
      filters.author = { includeAny: filterConfig.authorNames };
    }
    if (filterConfig.hasNoTags) {
      filters.tags = { ...(filters.tags || {}), includeNotSet: true };
    }
    if (filterConfig.hasNoAuthor) {
      filters.author = { ...(filters.author || {}), includeNotSet: true };
    }
    if (filterConfig.colorFilter) {
      const cf = filterConfig.colorFilter as any;
      const color: any = {};
      if (cf.hueCategories?.length) color.hueCategories = cf.hueCategories;
      if (cf.toneSaturation !== undefined && cf.toneLightness !== undefined) {
        color.tonePoint = { saturation: cf.toneSaturation, lightness: cf.toneLightness };
      }
      if (cf.toneTolerance !== undefined) color.toneTolerance = cf.toneTolerance;
      if (cf.similarityThreshold !== undefined) color.similarityThreshold = cf.similarityThreshold;
      if (cf.customColor) color.customColor = cf.customColor;
      if (Object.keys(color).length > 0) filters.color = color as any;
    }

    const sort: SortOptions = { by: 'recommended', order: 'desc' };
    const mode =
      filterConfig.search && filterConfig.search.trim().length > 0
        ? SearchMode.UNIFIED
        : SearchMode.ALL;
    const result = await searchService.search({
      mode,
      datasetId: collection.dataSetId,
      query: mode === SearchMode.UNIFIED ? filterConfig.search!.trim() : undefined,
      filters,
      sort,
      pagination: { limit, offset },
    });

    // Enrich: attach assetCount and ensure thumbnail path
    const ids = result.stacks.map((s: any) => s.id);
    let assetCountMap = new Map<number, number>();
    let firstAssetMap = new Map<number, string | undefined>();
    if (ids.length > 0) {
      const counts = await this.prisma.asset.groupBy({
        by: ['stackId'],
        where: { stackId: { in: ids } },
        _count: { stackId: true },
      });
      assetCountMap = new Map(counts.map((c: any) => [c.stackId, c._count.stackId]));

      const firstAssets = await this.prisma.asset.findMany({
        where: { stackId: { in: ids } },
        orderBy: [{ stackId: 'asc' }, { orderInStack: 'asc' }],
        select: { stackId: true, thumbnail: true },
      });
      // Only keep first by stackId
      for (const fa of firstAssets) {
        if (!firstAssetMap.has(fa.stackId))
          firstAssetMap.set(fa.stackId, fa.thumbnail || undefined);
      }
    }

    const stacks = result.stacks.map((s: any) => {
      const dataSetId = s.dataSetId ?? collection.dataSetId;
      const assets = Array.isArray(s.assets)
        ? withPublicAssetArray(s.assets as any[], dataSetId)
        : undefined;

      const thumbnailSource = (() => {
        if (assets && assets.length > 0) {
          return assets[0]?.thumbnail ?? null;
        }
        return firstAssetMap.get(s.id) || s.thumbnail || '';
      })();

      const thumbnail = toPublicAssetPath(thumbnailSource, dataSetId);

      return {
        ...s,
        ...(assets ? { assets } : {}),
        thumbnail,
        assetCount: assetCountMap.get(s.id) ?? 0,
      };
    });

    return { stacks, total: result.total, limit: result.limit, offset: result.offset };
  }

  // マニュアルコレクション用：コレクション内のスタックを取得
  async getCollectionStacks(collectionId: number, limit = 50, offset = 0) {
    const collectionStacks = await this.prisma.collectionStack.findMany({
      where: { collectionId },
      include: {
        stack: {
          include: {
            author: true,
            tags: {
              include: {
                tag: true,
              },
            },
          },
        },
      },
      orderBy: [{ orderIndex: 'asc' }],
      take: limit,
      skip: offset,
    });

    return collectionStacks.map((cs) => ({
      stack: cs.stack,
      orderIndex: cs.orderIndex,
    }));
  }

  // スタックを一括でコレクションに追加
  async bulkAddStacksToCollection(collectionId: number, stackIds: number[]): Promise<void> {
    // 既存のスタックをチェック
    const existingStacks = await this.prisma.collectionStack.findMany({
      where: {
        collectionId,
        stackId: { in: stackIds },
      },
      select: { stackId: true },
    });

    const existingStackIds = new Set(existingStacks.map((cs) => cs.stackId));
    const newStackIds = stackIds.filter((id) => !existingStackIds.has(id));

    if (newStackIds.length === 0) {
      return; // 全て既に追加済み
    }

    // 最大orderIndexを取得
    const maxOrder = await this.prisma.collectionStack.findFirst({
      where: { collectionId },
      orderBy: { orderIndex: 'desc' },
    });

    const startOrderIndex = (maxOrder?.orderIndex || 0) + 1;

    // 一括で追加
    const data = newStackIds.map((stackId, index) => ({
      collectionId,
      stackId,
      orderIndex: startOrderIndex + index,
    }));

    await this.prisma.collectionStack.createMany({
      data,
    });
  }
}
