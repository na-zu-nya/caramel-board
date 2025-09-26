import type { Author } from '@prisma/client';
import { getPrisma } from '../lib/Repository';

const prisma = getPrisma();

export class AuthorModel {
  static create(key: string): Promise<Author> {
    return prisma.author.create({
      data: {
        name: key,
      },
    });
  }

  static get(key: string): Promise<Author> {
    return prisma.author.findUnique({
      where: {
        name: key,
      },
    });
  }

  static delete(id: number | string): Promise<Author> {
    return prisma.author.delete({
      where: {
        id: typeof id === 'number' ? id : undefined,
        name: typeof id === 'string' ? id : undefined,
      },
    });
  }

  static search(key: string, take?: number): Promise<Author[]> {
    console.log(key);
    return prisma.author.findMany({
      take,
      where: {
        name: {
          contains: key,
        },
      },
    });
  }
}
