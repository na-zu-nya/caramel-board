import type { CollectionFolder, Prisma, PrismaClient } from '@prisma/client';
import type {
  CollectionFolderQuery,
  CreateCollectionFolderInput,
  FolderTreeQuery,
  UpdateCollectionFolderInput,
} from '../../models/CollectionFolderModel';

export class CollectionFolderService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async create(data: CreateCollectionFolderInput): Promise<CollectionFolder> {
    // 同じ親フォルダ内で最大のorderを取得し、次のorderを設定
    if (data.order === undefined || data.order === 0) {
      const maxOrder = await this.prisma.collectionFolder.findFirst({
        where: {
          dataSetId: data.dataSetId,
          parentId: data.parentId || null,
        },
        orderBy: { order: 'desc' },
      });
      data.order = (maxOrder?.order || 0) + 1;
    }

    return this.prisma.collectionFolder.create({
      data: {
        name: data.name,
        icon: data.icon || '📁',
        description: data.description,
        dataSetId: data.dataSetId,
        parentId: data.parentId || null,
        order: data.order,
      },
      include: {
        dataSet: true,
        parent: true,
        children: {
          orderBy: { order: 'asc' },
        },
        collections: {
          include: {
            _count: {
              select: {
                collectionStacks: true,
              },
            },
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            children: true,
            collections: true,
          },
        },
      },
    });
  }

  async findAll(query: CollectionFolderQuery) {
    const where: Prisma.CollectionFolderWhereInput = {};

    if (query.dataSetId) {
      where.dataSetId = query.dataSetId;
    }

    if (query.parentId !== undefined) {
      where.parentId = query.parentId || null;
    }

    const [folders, total] = await Promise.all([
      this.prisma.collectionFolder.findMany({
        where,
        include: {
          dataSet: true,
          parent: true,
          children: query.includeCollections
            ? {
                orderBy: { order: 'asc' },
              }
            : false,
          collections: query.includeCollections
            ? {
                include: {
                  _count: {
                    select: {
                      collectionStacks: true,
                    },
                  },
                },
                orderBy: { name: 'asc' },
              }
            : false,
          _count: {
            select: {
              children: true,
              collections: true,
            },
          },
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.collectionFolder.count({ where }),
    ]);

    return {
      folders,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findById(id: number): Promise<CollectionFolder | null> {
    return this.prisma.collectionFolder.findUnique({
      where: { id },
      include: {
        dataSet: true,
        parent: true,
        children: {
          orderBy: { order: 'asc' },
        },
        collections: {
          include: {
            _count: {
              select: {
                collectionStacks: true,
              },
            },
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            children: true,
            collections: true,
          },
        },
      },
    });
  }

  async update(id: number, data: UpdateCollectionFolderInput): Promise<CollectionFolder> {
    return this.prisma.collectionFolder.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        dataSet: true,
        parent: true,
        children: {
          orderBy: { order: 'asc' },
        },
        collections: {
          include: {
            _count: {
              select: {
                collectionStacks: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            children: true,
            collections: true,
          },
        },
      },
    });
  }

  async delete(id: number): Promise<CollectionFolder> {
    // 子フォルダとコレクションは CASCADE削除される
    // 削除前にフォルダが空でない場合はエラーを投げる
    const folder = await this.prisma.collectionFolder.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            children: true,
            collections: true,
          },
        },
      },
    });

    if (!folder) {
      throw new Error('フォルダが見つかりません');
    }

    if (folder._count.children > 0 || folder._count.collections > 0) {
      throw new Error('フォルダを削除するには、中身を空にする必要があります');
    }

    return this.prisma.collectionFolder.delete({
      where: { id },
    });
  }

  // フォルダツリー全体を取得（階層構造で）
  async getFolderTree(query: FolderTreeQuery) {
    // ルートフォルダを取得
    const rootFolders = await this.prisma.collectionFolder.findMany({
      where: {
        dataSetId: query.dataSetId,
        parentId: null,
      },
      include: {
        collections: query.includeCollections
          ? {
              include: {
                _count: {
                  select: {
                    collectionStacks: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            }
          : false,
        _count: {
          select: {
            children: true,
            collections: true,
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    // 再帰的に子フォルダを取得
    type FolderNode = (typeof rootFolders)[number] & { children?: FolderNode[] };

    const buildTree = async (folders: FolderNode[]): Promise<FolderNode[]> => {
      for (const folder of folders) {
        const children = (await this.prisma.collectionFolder.findMany({
          where: {
            parentId: folder.id,
          },
          include: {
            collections: query.includeCollections
              ? {
                  include: {
                    _count: {
                      select: {
                        collectionStacks: true,
                      },
                    },
                  },
                  orderBy: { name: 'asc' },
                }
              : false,
            _count: {
              select: {
                children: true,
                collections: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        })) as FolderNode[];

        if (children.length > 0) {
          folder.children = await buildTree(children);
        } else {
          folder.children = [];
        }
      }
      return folders;
    };

    const tree = await buildTree(rootFolders as FolderNode[]);

    // ルートレベルのコレクション（フォルダに属さない）も取得
    let rootCollections = [];
    if (query.includeCollections) {
      rootCollections = await this.prisma.collection.findMany({
        where: {
          dataSetId: query.dataSetId,
          folderId: null,
        },
        include: {
          _count: {
            select: {
              collectionStacks: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    }

    return {
      folders: tree,
      rootCollections,
    };
  }

  // フォルダの順序を変更
  async reorderFolders(
    _dataSetId: number,
    _parentId: number | null,
    folderOrders: { folderId: number; order: number }[]
  ): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      for (const { folderId, order } of folderOrders) {
        await prisma.collectionFolder.update({
          where: { id: folderId },
          data: { order },
        });
      }
    });
  }

  // フォルダの移動（親フォルダ変更）
  async moveFolder(folderId: number, newParentId: number | null): Promise<CollectionFolder> {
    // 循環参照をチェック（自分自身や子孫を親にしようとしていないか）
    if (newParentId) {
      const isDescendant = await this.isDescendant(folderId, newParentId);
      if (isDescendant) {
        throw new Error('フォルダを自分自身や子孫フォルダに移動することはできません');
      }
    }

    return this.prisma.collectionFolder.update({
      where: { id: folderId },
      data: {
        parentId: newParentId,
        updatedAt: new Date(),
      },
      include: {
        dataSet: true,
        parent: true,
        children: {
          orderBy: { order: 'asc' },
        },
        collections: {
          include: {
            _count: {
              select: {
                collectionStacks: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            children: true,
            collections: true,
          },
        },
      },
    });
  }

  // 指定したフォルダが指定した親フォルダの子孫かどうかをチェック
  private async isDescendant(childId: number, ancestorId: number): Promise<boolean> {
    if (childId === ancestorId) return true;

    const child = await this.prisma.collectionFolder.findUnique({
      where: { id: childId },
      select: { parentId: true },
    });

    if (!child || !child.parentId) return false;

    return this.isDescendant(child.parentId, ancestorId);
  }
}
