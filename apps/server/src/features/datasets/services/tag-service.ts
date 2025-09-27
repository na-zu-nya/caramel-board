import type { Prisma, PrismaClient } from '@prisma/client';
import { processStacksThumbnails, STACK_LIST_WITH_TAGS_INCLUDE } from '../../../utils/stackHelpers';

export interface CreateTagData {
  title: string;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
  orderBy?: string;
  orderDirection?: string;
}

export const createTagService = (deps: { prisma: PrismaClient; dataSetId: number }) => {
  const { prisma, dataSetId } = deps;

  async function getAll(pagination: PaginationOptions) {
    const { limit, offset, orderBy = 'title', orderDirection = 'asc' } = pagination;

    const where = { dataSetId };

    // 順序設定の作成
    const direction: Prisma.SortOrder = orderDirection === 'desc' ? 'desc' : 'asc';
    let orderByClause: Prisma.TagOrderByWithRelationInput;
    if (orderBy === 'stackCount') {
      orderByClause = {
        stack: {
          _count: direction,
        },
      };
    } else {
      orderByClause = { [orderBy]: direction } as Prisma.TagOrderByWithRelationInput;
    }

    const [tags, total] = await Promise.all([
      prisma.tag.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: orderByClause,
        include: {
          _count: {
            select: { stack: true },
          },
        },
      }),
      prisma.tag.count({ where }),
    ]);

    return {
      tags: tags.map((tag) => ({
        ...tag,
        stackCount: tag._count.stack,
      })),
      total,
      limit,
      offset,
    };
  }

  async function create(data: CreateTagData) {
    // Idempotent create: return existing tag if unique(title, dataSetId) already exists
    return prisma.tag.upsert({
      where: {
        title_dataSetId: {
          title: data.title,
          dataSetId,
        },
      },
      update: {},
      create: {
        title: data.title,
        dataSetId,
      },
    });
  }

  async function tagStack(stackId: number, tagIds: number[]) {
    // Verify stack belongs to this dataset
    const stack = await prisma.stack.findFirst({
      where: { id: stackId, dataSetId },
    });

    if (!stack) {
      throw new Error('Stack not found in this dataset');
    }

    // Remove existing tags
    await prisma.tagsOnStack.deleteMany({
      where: { stackId },
    });

    // Add new tags
    if (tagIds.length > 0) {
      await prisma.tagsOnStack.createMany({
        data: tagIds.map((tagId) => ({
          stackId,
          tagId,
        })),
      });
    }

    // Embedding regeneration removed

    return { success: true };
  }

  async function deleteTag(id: number) {
    // Find all stacks with this tag before deletion
    const _stacksWithTag = await prisma.tagsOnStack.findMany({
      where: { tagId: id },
      select: { stackId: true },
    });

    const deletedTag = await prisma.tag.delete({
      where: { id },
    });

    // Embedding regeneration removed

    return deletedTag;
  }

  async function search(key: string) {
    if (!key || key.length === 0) {
      return [];
    }

    const tags = await prisma.tag.findMany({
      where: {
        dataSetId,
        title: {
          contains: key,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      take: 10,
      orderBy: { title: 'asc' },
    });

    return tags.map((tag) => tag.title);
  }

  async function rename(id: number, newTitle: string) {
    const tag = await prisma.tag.update({
      where: { id },
      data: { title: newTitle },
    });

    // Find all stacks with this tag and regenerate their embeddings
    const _stacksWithTag = await prisma.tagsOnStack.findMany({
      where: { tagId: id },
      select: { stackId: true },
    });

    // Embedding regeneration removed

    return tag;
  }

  async function merge(sourceTagIds: number[], targetTagId: number) {
    // Get all stacks that have any of the source tags
    const stacksWithSourceTags = await prisma.tagsOnStack.findMany({
      where: {
        tagId: { in: sourceTagIds },
      },
      select: { stackId: true },
      distinct: ['stackId'],
    });

    // Add target tag to these stacks (if not already present)
    for (const { stackId } of stacksWithSourceTags) {
      await prisma.tagsOnStack.upsert({
        where: {
          stackId_tagId: {
            stackId,
            tagId: targetTagId,
          },
        },
        create: {
          stackId,
          tagId: targetTagId,
        },
        update: {},
      });
    }

    // Delete source tags and their associations
    await prisma.tag.deleteMany({
      where: {
        id: { in: sourceTagIds },
      },
    });

    // Embedding regeneration removed

    return { success: true, affectedStacks: stacksWithSourceTags.length };
  }

  async function getStacksByTag(tagId: number, pagination: PaginationOptions) {
    const { limit, offset } = pagination;

    const [stacks, total] = await Promise.all([
      prisma.stack.findMany({
        where: {
          tags: {
            some: { tagId },
          },
          dataSetId,
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: STACK_LIST_WITH_TAGS_INCLUDE,
      }),
      prisma.stack.count({
        where: {
          tags: {
            some: { tagId },
          },
          dataSetId,
        },
      }),
    ]);

    // Process stacks to add thumbnail from first asset
    const processedStacks = processStacksThumbnails(stacks).map((stack) => ({
      ...stack,
      assetCount: stack._count.assets,
      // Ensure thumbnail has leading slash
      thumbnail: stack.thumbnail ? `/${stack.thumbnail}` : '',
    }));

    return {
      stacks: processedStacks,
      total,
      limit,
      offset,
    };
  }

  return {
    getAll,
    create,
    tagStack,
    delete: deleteTag,
    search,
    rename,
    merge,
    getStacksByTag,
  };
};
