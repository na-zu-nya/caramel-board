import type {Asset, Author, Stack, Tag, TagsOnStack} from '@prisma/client';
import {getPrisma} from '../lib/Repository';
import {ServerError} from '../utils/ServerError';
import {AssetModel} from './AssetModel';
import {toPublicAssetPath} from '../utils/assetPath';
import {AuthorModel} from './AuthorModel';
import {TagModel} from './TagModel';

const prisma = getPrisma();

export class StackModel {
  static async create(name = '', thumbnail = '', mediaType = 'image', dataSetId = 1): Promise<Stack> {
    return prisma.stack.create({
      data: {
        name,
        thumbnail,
        mediaType,
        dataSetId,
        meta: {},
      },
    });
  }

  static async get(
    id: number,
    option: Partial<{ assets: boolean; tags: boolean; author: boolean }> = {}
  ): Promise<Stack> {
    const _option = {
      assets: true,
      tags: true,
      author: true,
      createdAt: true,
      orderInStack: true,
      ...option,
    };
    const stack = await prisma.stack.findUnique({
      where: { id },
      include: {
        assets: {
          orderBy: {
            orderInStack: 'asc',
          },
        },
        tags: true,
        author: true,
      },
    });
    if (_option.tags) {
      const tags = await StackModel.getTags(id);
      stack.tags = tags.map((t) => t.tag.title);
    }

    return StackModel.translate(stack);
  }

  static async delete(id: number): Promise<Stack> {
    const stack = await StackModel.get(id);

    console.log(stack);

    for (const asset of stack.assets as Asset[]) {
      await AssetModel.delete(asset.id);
    }

    for (const tag of stack.tags as string[]) {
      await StackModel.deleteTag(stack.id, tag);
    }

    return prisma.stack.delete({ where: { id } });
  }

  static async getMeta(id: number): Promise<unknown> {
    return StackModel.get(id).then((stack) => stack.meta ?? {});
  }

  static async updateMeta(id: number, meta: any): Promise<boolean> {
    await prisma.stack.update({
      where: {
        id,
      },
      data: {
        meta,
      },
    });
    return true;
  }

  static async getTags(id: number): Promise<TagsOnStack[]> {
    return prisma.tagsOnStack.findMany({
      where: {
        stackId: id,
      },
      include: {
        tag: true,
      },
    });
  }

  static async addTag(id: number, tagKey: string): Promise<Stack> {
    const stack = await StackModel.get(id, { assets: false, tags: false });

    let tag: Tag;
    tag = await TagModel.get(tagKey);
    if (!tag) {
      tag = await TagModel.create(tagKey);
    }
    if ((stack.tags as TagsOnStack[]).some((t) => t.tagId === tag.id)) {
      throw new ServerError(400, 'Same tag exists');
    }

    await prisma.stack.update({
      where: {
        id,
      },
      data: {
        tags: {
          create: [{ tagId: tag.id }],
        },
      },
    });

    return;
  }

  static async deleteTag(id: number, tagKey: string): Promise<Stack> {
    const tag = await TagModel.get(tagKey);
    if (!tag) {
      throw new ServerError(400, 'Tag not exists');
    }

    await prisma.tagsOnStack.delete({
      where: {
        stackId_tagId: {
          stackId: id,
          tagId: tag.id,
        },
      },
    });

    const item = await prisma.tagsOnStack.findFirst({
      where: {
        tagId: tag.id,
      },
    });
    if (!item) {
      await TagModel.delete(tag.id);
    }

    return;
  }

  static async updateAuthor(id: number, authorName: string): Promise<Stack> {
    if (authorName === '') {
      return prisma.stack.update({
        where: {
          id,
        },
        data: {
          authorId: null,
        },
      });
    }
    let author: Author;
    author = await AuthorModel.get(authorName);
    if (!author) {
      author = await AuthorModel.create(authorName);
    }

    return prisma.stack.update({
      where: {
        id,
      },
      data: {
        authorId: author.id,
      },
    });
  }

  static async merge(mainId: number, childrenIds: number[]) {
    const targetStack = await StackModel.get(mainId, {
      assets: false,
      tags: false,
    });
    const childrenStacks = await Promise.all(
      childrenIds.map((id) => {
        return StackModel.get(id);
      })
    );

    for (const childrenStack of childrenStacks) {
      const assets = (childrenStack.assets ?? []) as Asset[];
      for (const asset of assets) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: { stackId: targetStack.id },
        });
      }
      await StackModel.delete(childrenStack.id);
    }
  }

  static translate(stack: Stack & { assets?: Asset[] }) {
    if ('assets' in stack && Array.isArray(stack.assets)) {
      stack.assets = stack.assets.map((asset) => AssetModel.translate(asset));
      // 最初のアセットのサムネイルをStackのサムネイルとして使用
      if (stack.assets.length > 0 && !stack.thumbnail) {
        stack.thumbnail = stack.assets[0].thumbnail;
      }
    }
    stack.thumbnail = toPublicAssetPath(stack.thumbnail, stack.dataSetId);
    return stack;
  }
}
