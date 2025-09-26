import type {DataSet, PrismaClient} from '@prisma/client';
import {processStacksThumbnails} from '../../utils/stackHelpers';
import {prisma} from '../di';

export interface CreateDataSetData {
  name: string;
  icon?: string;
  themeColor?: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface UpdateDataSetData {
  name?: string;
  icon?: string;
  themeColor?: string;
  description?: string;
  settings?: Record<string, any>;
}

interface RecentLikeRaw {
  id: number;
  title: string;
  liked: number;
  mediaType: string;
  dataSetId: number;
  createdAt: Date;
  updatedAt: Date;
  asset_id: number | null;
  asset_thumbnail: string | null;
}

export class DataSetService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateDataSetData): Promise<DataSet> {
    // When creating the very first dataset, mark it as default
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.dataSet.count();
      const isFirst = count === 0;

      return tx.dataSet.create({
        data: {
          name: data.name,
          icon: data.icon,
          themeColor: data.themeColor,
          description: data.description,
          settings: data.settings || {},
          isDefault: isFirst,
        },
      });
    });
  }

  async getAll(): Promise<DataSet[]> {
    return this.prisma.dataSet.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async getById(id: number, includePins = false): Promise<DataSet | null> {
    return this.prisma.dataSet.findUnique({
      where: { id },
      include: includePins
        ? {
            pins: {
              include: {
                stack: {
                  include: {
                    assets: {
                      orderBy: { orderInStack: 'asc' },
                      take: 1,
                    },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          }
        : undefined,
    });
  }

  async getByName(name: string): Promise<DataSet | null> {
    return this.prisma.dataSet.findUnique({
      where: { name },
    });
  }

  async update(id: number, data: UpdateDataSetData): Promise<DataSet> {
    return this.prisma.dataSet.update({
      where: { id },
      data: {
        name: data.name,
        icon: data.icon,
        themeColor: data.themeColor,
        description: data.description,
        settings: data.settings,
      },
    });
  }

  async delete(id: number): Promise<void> {
    // デフォルトデータセットは削除できない
    const ds = await this.prisma.dataSet.findUnique({ where: { id }, select: { isDefault: true } });
    if (ds?.isDefault) {
      throw new Error('Cannot delete default dataset');
    }

    await this.prisma.dataSet.delete({
      where: { id },
    });
  }

  /**
   * Set a dataset as default. Ensures uniqueness by clearing the flag on others.
   */
  async setDefault(id: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.dataSet.updateMany({ data: { isDefault: false }, where: { NOT: { id } } }),
      this.prisma.dataSet.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  async getStats(id: number): Promise<{
    stackCount: number;
    assetCount: number;
    tagCount: number;
    authorCount: number;
  }> {
    const [stackCount, tagCount, authorCount] = await Promise.all([
      this.prisma.stack.count({ where: { dataSetId: id } }),
      this.prisma.tag.count({ where: { dataSetId: id } }),
      this.prisma.author.count({ where: { dataSetId: id } }),
    ]);

    // アセット数は各スタックのアセットの合計
    const assetCount = await this.prisma.asset.count({
      where: {
        stack: {
          dataSetId: id,
        },
      },
    });

    return {
      stackCount,
      assetCount,
      tagCount,
      authorCount,
    };
  }

  async ensureDefaultDataSet(): Promise<DataSet> {
    const defaultDataSet = await this.getById(1);
    if (!defaultDataSet) {
      return this.prisma.dataSet.create({
        data: {
          id: 1,
          name: 'Default',
          description: 'デフォルトデータセット',
        },
      });
    }
    return defaultDataSet;
  }

  async getOverview(id: number) {
    // メディアタイプごとの統計
    const mediaTypes = await Promise.all(
      ['image', 'comic', 'video'].map(async (mediaType) => {
        const count = await this.prisma.stack.count({
          where: { dataSetId: id, mediaType },
        });

        // 最新のサムネイルを取得
        const recentStack = await this.prisma.stack.findFirst({
          where: { dataSetId: id, mediaType },
          orderBy: { createdAt: 'desc' },
          include: {
            assets: {
              take: 1,
              orderBy: { orderInStack: 'asc' },
            },
          },
        });

        const thumbnail = recentStack?.assets?.[0]?.thumbnail || null;

        return { mediaType, count, thumbnail };
      })
    );

    // コレクション情報（サムネイル付き）
    const collections = await this.prisma.collection.findMany({
      where: { dataSetId: id },
      select: {
        id: true,
        name: true,
        icon: true,
        _count: {
          select: { collectionStacks: true },
        },
        collectionStacks: {
          take: 1,
          orderBy: { orderIndex: 'asc' },
          select: {
            stack: {
              select: {
                assets: {
                  take: 1,
                  orderBy: { orderInStack: 'asc' },
                  select: {
                    thumbnail: true,
                  },
                },
              },
            },
          },
        },
      },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    });

    // タグクラウド（頻度の高いタグ）
    const tagCloud = await this.prisma.tagsOnStack.groupBy({
      by: ['tagId'],
      where: {
        stack: { dataSetId: id },
      },
      _count: {
        tagId: true,
      },
      orderBy: {
        _count: {
          tagId: 'desc',
        },
      },
      take: 20,
    });

    // タグ情報を取得
    const tagIds = tagCloud.map((t) => t.tagId);
    const tags = await this.prisma.tag.findMany({
      where: { id: { in: tagIds } },
    });

    const tagMap = new Map(tags.map((tag) => [tag.id, tag]));

    // 最近のいいね
    const recentLikesRaw = await prisma.$queryRaw<RecentLikeRaw[]>`
      SELECT s.*, 
             a.id as "asset_id",
             a.thumbnail as "asset_thumbnail"
      FROM "Stack" s
      LEFT JOIN LATERAL (
        SELECT MAX("createdAt") AS last_liked
        FROM "LikeActivity" la
        WHERE la."stackId" = s.id
      ) l ON TRUE
      LEFT JOIN LATERAL (
        SELECT id, thumbnail
        FROM "Asset" a
        WHERE a."stackId" = s.id
        ORDER BY a."orderInStack" ASC
        LIMIT 1
      ) a ON TRUE
      WHERE s."dataSetId" = ${id} AND s.liked <> 0
      ORDER BY l.last_liked DESC NULLS LAST
      LIMIT 12;
    `;

    // SQLの結果を processStacksThumbnails が期待する形式に変換
    const recentLikes = recentLikesRaw.map((row) => ({
      ...row,
      assets: row.asset_id
        ? [
            {
              id: row.asset_id,
              thumbnail: row.asset_thumbnail,
            },
          ]
        : [],
    }));

    return {
      mediaTypes,
      collections: collections.map((col) => ({
        id: col.id,
        name: col.name,
        icon: col.icon,
        count: col._count.collectionStacks,
        thumbnail: col.collectionStacks?.[0]?.stack?.assets?.[0]?.thumbnail || null,
      })),
      tagCloud: tagCloud
        .map((t) => {
          const tag = tagMap.get(t.tagId);
          if (!tag) return null;
          return {
            id: tag.id,
            name: tag.title,
            count: t._count.tagId,
          };
        })
        .filter((t) => t !== null),
      recentLikes: processStacksThumbnails(recentLikes),
    };
  }
}
