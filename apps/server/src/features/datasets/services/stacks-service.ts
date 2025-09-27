import type { PrismaClient } from '@prisma/client';
import type { createFileService } from './file-service';

export const createStacksService = (deps: {
  prisma: PrismaClient;
  fileService?: ReturnType<typeof createFileService>;
}) => {
  const { prisma } = deps;

  return {
    async getStacks(id: number) {
      const { prisma } = deps;
      return prisma.stack.findFirst({
        where: { id },
        include: {
          assets: true,
          author: true,
          tags: {
            include: {
              tag: true,
            },
          },
          collectionStacks: {
            include: {
              collection: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
          autoTagAggregate: true,
          // embeddings removed
        },
      });
    },

    async deleteStack(id: number) {
      const { prisma } = deps;
      const stack = await prisma.stack.findFirst({ where: { id } });

      if (!stack) {
        throw new Error('Stack not found in this dataset');
      }

      // Delete related assets first
      const _assets = await prisma.asset.findMany({
        where: { stackId: id },
      });

      return prisma.stack.delete({
        where: { id },
      });
    },

    // 単一Stack操作
    async addTag(stackId: number, dataSetId: number, tagName: string) {
      // タグが存在しない場合は作成
      const tag = await prisma.tag.upsert({
        where: {
          title_dataSetId: {
            title: tagName,
            dataSetId,
          },
        },
        update: {},
        create: {
          title: tagName,
          dataSetId,
        },
      });

      // TagsOnStackの作成
      await prisma.tagsOnStack.create({
        data: {
          stackId,
          tagId: tag.id,
        },
      });

      return { success: true, tag };
    },

    async removeTag(stackId: number, dataSetId: number, tagName: string) {
      const tag = await prisma.tag.findUnique({
        where: {
          title_dataSetId: {
            title: tagName,
            dataSetId,
          },
        },
      });

      if (!tag) {
        throw new Error('Tag not found');
      }

      await prisma.tagsOnStack.delete({
        where: {
          stackId_tagId: {
            stackId,
            tagId: tag.id,
          },
        },
      });

      return { success: true };
    },

    async updateAuthor(stackId: number, dataSetId: number, authorName: string) {
      // 作者が存在しない場合は作成
      const author = await prisma.author.upsert({
        where: {
          name_dataSetId: {
            name: authorName,
            dataSetId,
          },
        },
        update: {},
        create: {
          name: authorName,
          dataSetId,
        },
      });

      // Stackの作者を更新
      await prisma.stack.update({
        where: { id: stackId },
        data: { authorId: author.id },
      });

      return { success: true, author };
    },

    async refreshThumbnail(stackId: number, dataSetId: number) {
      if (!deps.fileService) {
        throw new Error('fileService is not available');
      }

      const thumbnailPath = await deps.fileService.refreshStackThumbnail(stackId, dataSetId);
      return { success: true, thumbnailPath };
    },

    // refreshEmbeddings removed

    // 複数Stack操作
    async bulkAddTags(stackIds: number[], dataSetId: number, tagNames: string[]) {
      const results = [];

      // すべてのタグを事前に作成/取得
      const tags = await Promise.all(
        tagNames.map((title) =>
          prisma.tag.upsert({
            where: {
              title_dataSetId: {
                title,
                dataSetId,
              },
            },
            update: {},
            create: {
              title,
              dataSetId,
            },
          })
        )
      );

      // 各スタックにタグを追加
      for (const stackId of stackIds) {
        for (const tag of tags) {
          try {
            await prisma.tagsOnStack.create({
              data: {
                stackId,
                tagId: tag.id,
              },
            });
            results.push({ stackId, tagId: tag.id, success: true });
          } catch (_error) {
            // 既に存在する場合はスキップ
            results.push({ stackId, tagId: tag.id, success: false, error: 'Already exists' });
          }
        }
      }

      return { results, tags };
    },

    async bulkSetAuthor(stackIds: number[], dataSetId: number, authorName: string) {
      // 作者を作成/取得
      const author = await prisma.author.upsert({
        where: {
          name_dataSetId: {
            name: authorName,
            dataSetId,
          },
        },
        update: {},
        create: {
          name: authorName,
          dataSetId,
        },
      });

      // 一括更新
      const result = await prisma.stack.updateMany({
        where: {
          id: { in: stackIds },
          dataSetId,
        },
        data: {
          authorId: author.id,
        },
      });

      return { success: true, author, updatedCount: result.count };
    },

    async bulkRefreshThumbnails(stackIds: number[], dataSetId: number) {
      if (!deps.fileService) {
        throw new Error('fileService is not available');
      }

      const results = [];

      for (const stackId of stackIds) {
        try {
          const thumbnailPath = await deps.fileService.refreshStackThumbnail(stackId, dataSetId);
          results.push({ stackId, success: true, thumbnailPath });
        } catch (error) {
          results.push({
            stackId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return { results };
    },

    // bulkRefreshEmbeddings removed
  };
};
