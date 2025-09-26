import {prisma} from '../di';

export interface PaginationOptions {
  limit: number;
  offset: number;
  dataSetId?: number;
}

export class AuthorService {
  async getAll(pagination: PaginationOptions) {
    const { limit, offset, dataSetId = 1 } = pagination;

    const where = { dataSetId };

    const [authors, total] = await Promise.all([
      prisma.author.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { stacks: true },
          },
        },
      }),
      prisma.author.count({ where }),
    ]);

    return {
      authors: authors.map((author) => ({
        ...author,
        stackCount: author._count.stacks,
      })),
      total,
      limit,
      offset,
    };
  }

  async search(key: string, dataSetId = 1) {
    if (!key || key.length === 0) {
      return [];
    }

    const authors = await prisma.author.findMany({
      where: {
        dataSetId,
        name: {
          contains: key,
          mode: 'insensitive' as any,
        },
      },
      take: 10,
      orderBy: { name: 'asc' },
    });

    return authors.map((author) => author.name);
  }
}
