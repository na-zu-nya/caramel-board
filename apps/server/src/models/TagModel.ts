import type { Tag } from '@prisma/client';
import { getPrisma } from '../lib/Repository';

const prisma = getPrisma();

export class TagModel {
  static create(key: string): Promise<Tag> {
    return prisma.tag.create({
      data: {
        title: key,
      },
    });
  }

  static get(key: string): Promise<Tag> {
    return prisma.tag.findUnique({
      where: {
        title: key,
      },
    });
  }

  static delete(id: number | string): Promise<Tag> {
    return prisma.tag.delete({
      where: {
        id: typeof id === 'number' ? id : undefined,
        title: typeof id === 'string' ? id : undefined,
      },
    });
  }

  static search(key: string, take?: number) {
    return prisma.tag.findMany({
      take,
      where: {
        title: {
          contains: key,
        },
      },
    });
  }
}
