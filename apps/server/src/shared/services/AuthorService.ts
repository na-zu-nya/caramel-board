import { Prisma } from '@prisma/client';
import {
  type AuthorLinkInput,
  MAX_AUTHOR_LINKS,
  type NormalizedAuthorLink,
  normalizeAuthorLinkProvider,
  normalizeAuthorLinks,
} from '../author-links';
import { prisma } from '../di';

export interface PaginationOptions {
  limit: number;
  offset: number;
  dataSetId?: number;
}

export interface AuthorUpdateInput {
  name?: string;
  links?: AuthorLinkInput[];
}

interface AuthorLinkRow {
  id: number;
  authorId: number;
  provider: string | null;
  label: string;
  url: string;
  externalId: string | null;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface SearchAuthorRow {
  id: number;
  name: string;
}

type DbClient = typeof prisma | Prisma.TransactionClient;

const toIso = (value: Date | string) => (value instanceof Date ? value.toISOString() : value);

const mapAuthorLink = (link: AuthorLinkRow) => ({
  id: link.id,
  authorId: link.authorId,
  provider: link.provider,
  label: link.label,
  url: link.url,
  externalId: link.externalId,
  sortOrder: link.sortOrder,
  createdAt: toIso(link.createdAt),
  updatedAt: toIso(link.updatedAt),
});

const linkDedupKey = (link: Pick<AuthorLinkRow, 'provider' | 'externalId' | 'url'>) =>
  link.provider && link.externalId ? `${link.provider}:${link.externalId}` : `url:${link.url}`;

export class AuthorService {
  private async getLinksByAuthorIds(db: DbClient, authorIds: number[]) {
    if (authorIds.length === 0) return new Map<number, ReturnType<typeof mapAuthorLink>[]>();
    const rows = await db.$queryRaw<AuthorLinkRow[]>`
      SELECT
        "id",
        "authorId",
        "provider",
        "label",
        "url",
        "externalId",
        "sortOrder",
        "createdAt",
        "updatedAt"
      FROM "AuthorLink"
      WHERE "authorId" IN (${Prisma.join(authorIds)})
      ORDER BY "sortOrder" ASC, "id" ASC
    `;
    const linksByAuthor = new Map<number, ReturnType<typeof mapAuthorLink>[]>();
    for (const row of rows) {
      const links = linksByAuthor.get(row.authorId) ?? [];
      links.push(mapAuthorLink(row));
      linksByAuthor.set(row.authorId, links);
    }
    return linksByAuthor;
  }

  private async replaceLinks(db: DbClient, authorId: number, links: NormalizedAuthorLink[]) {
    await db.$executeRaw`DELETE FROM "AuthorLink" WHERE "authorId" = ${authorId}`;
    const now = new Date();
    for (const link of links.slice(0, MAX_AUTHOR_LINKS)) {
      await db.$executeRaw`
        INSERT INTO "AuthorLink"
          ("authorId", "provider", "label", "url", "externalId", "sortOrder", "createdAt", "updatedAt")
        VALUES
          (${authorId}, ${link.provider}, ${link.label}, ${link.url}, ${link.externalId}, ${link.sortOrder}, ${now}, ${now})
      `;
    }
  }

  private async buildAuthorResult(
    db: DbClient,
    author: { id: number; name: string; dataSetId: number }
  ) {
    const [stackCount, linksByAuthor] = await Promise.all([
      db.stack.count({ where: { authorId: author.id } }),
      this.getLinksByAuthorIds(db, [author.id]),
    ]);
    return {
      id: author.id,
      dataSetId: author.dataSetId,
      name: author.name,
      stackCount,
      links: linksByAuthor.get(author.id) ?? [],
    };
  }

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
    const linksByAuthor = await this.getLinksByAuthorIds(
      prisma,
      authors.map((author) => author.id)
    );

    return {
      authors: authors.map((author) => ({
        id: author.id,
        dataSetId: author.dataSetId,
        name: author.name,
        stackCount: author._count.stacks,
        links: linksByAuthor.get(author.id) ?? [],
      })),
      total,
      limit,
      offset,
    };
  }

  async getById(id: number, dataSetId = 1) {
    const author = await prisma.author.findFirst({ where: { id, dataSetId } });
    if (!author) return null;
    return this.buildAuthorResult(prisma, author);
  }

  async search(key: string, dataSetId = 1) {
    if (!key || key.length === 0) {
      return [];
    }

    const like = `%${key}%`;
    const authors = await prisma.$queryRaw<SearchAuthorRow[]>`
      SELECT DISTINCT a."id", a."name"
      FROM "Author" a
      LEFT JOIN "AuthorLink" l ON l."authorId" = a."id"
      WHERE a."dataSetId" = ${dataSetId}
        AND (
          a."name" ILIKE ${like}
          OR l."externalId" ILIKE ${like}
          OR l."url" ILIKE ${like}
        )
      ORDER BY a."name" ASC
      LIMIT 10
    `;

    return authors;
  }

  async update(id: number, dataSetId: number, input: AuthorUpdateInput) {
    const normalizedName = input.name?.trim();
    const normalizedLinks =
      input.links !== undefined
        ? normalizeAuthorLinks(input.links).slice(0, MAX_AUTHOR_LINKS)
        : undefined;

    return prisma.$transaction(async (tx) => {
      const existing = await tx.author.findFirst({ where: { id, dataSetId } });
      if (!existing) return null;

      const author =
        normalizedName && normalizedName !== existing.name
          ? await tx.author.update({ where: { id }, data: { name: normalizedName } })
          : existing;

      if (normalizedLinks !== undefined) {
        await this.replaceLinks(tx, id, normalizedLinks);
      }

      return this.buildAuthorResult(tx, author);
    });
  }

  async addLink(id: number, dataSetId: number, input: AuthorLinkInput) {
    return prisma.$transaction(async (tx) => {
      const author = await tx.author.findFirst({ where: { id, dataSetId } });
      if (!author) return null;

      const linksByAuthor = await this.getLinksByAuthorIds(tx, [id]);
      const current = linksByAuthor.get(id) ?? [];
      if (current.length >= MAX_AUTHOR_LINKS) {
        throw new Error(`Author links can contain at most ${MAX_AUTHOR_LINKS} entries`);
      }

      const [link] = normalizeAuthorLinks([input]).map((entry) => ({
        ...entry,
        sortOrder: current.length,
      }));
      await this.replaceLinks(
        tx,
        id,
        [
          ...current.map((entry, index) => ({
            provider: normalizeAuthorLinkProvider(entry.provider),
            label: entry.label,
            url: entry.url,
            externalId: entry.externalId,
            sortOrder: index,
          })),
          link,
        ].slice(0, MAX_AUTHOR_LINKS)
      );

      return this.buildAuthorResult(tx, author);
    });
  }

  async merge(dataSetId: number, targetAuthorId: number, sourceAuthorIds: number[]) {
    const sourceIds = [...new Set(sourceAuthorIds.filter((id) => id !== targetAuthorId))];
    if (sourceIds.length === 0) return this.getById(targetAuthorId, dataSetId);

    return prisma.$transaction(async (tx) => {
      const authors = await tx.author.findMany({
        where: { dataSetId, id: { in: [targetAuthorId, ...sourceIds] } },
        orderBy: { name: 'asc' },
      });
      const target = authors.find((author) => author.id === targetAuthorId);
      if (!target) return null;
      const validSourceIds = authors
        .filter((author) => sourceIds.includes(author.id))
        .map((author) => author.id);
      if (validSourceIds.length === 0) return this.buildAuthorResult(tx, target);

      const linksByAuthor = await this.getLinksByAuthorIds(tx, [targetAuthorId, ...validSourceIds]);
      const mergedLinks: NormalizedAuthorLink[] = [];
      const seenLinks = new Set<string>();
      for (const authorId of [targetAuthorId, ...validSourceIds]) {
        for (const link of linksByAuthor.get(authorId) ?? []) {
          const key = linkDedupKey(link);
          if (seenLinks.has(key) || mergedLinks.length >= MAX_AUTHOR_LINKS) continue;
          seenLinks.add(key);
          mergedLinks.push({
            provider: normalizeAuthorLinkProvider(link.provider),
            label: link.label,
            url: link.url,
            externalId: link.externalId,
            sortOrder: mergedLinks.length,
          });
        }
      }

      await tx.stack.updateMany({
        where: { dataSetId, authorId: { in: validSourceIds } },
        data: { authorId: targetAuthorId },
      });
      await tx.author.deleteMany({ where: { dataSetId, id: { in: validSourceIds } } });
      await this.replaceLinks(tx, targetAuthorId, mergedLinks);

      return this.buildAuthorResult(tx, target);
    });
  }
}
