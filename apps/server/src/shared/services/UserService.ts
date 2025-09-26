import type {PrismaClient} from '@prisma/client';

const SUPER_USER_NAME = 'super';
let cachedSuperUserId: number | null = null;

/**
 * 単一ユーザー運用時に利用する super ユーザーを保証して ID を返します。
 * すでに作成済みであればキャッシュを返し、未作成の場合は upsert します。
 */
export async function ensureSuperUser(prisma: PrismaClient): Promise<number> {
  if (cachedSuperUserId !== null) {
    return cachedSuperUserId;
  }

  const user = await prisma.user.upsert({
    where: {name: SUPER_USER_NAME},
    update: {},
    create: {
      name: SUPER_USER_NAME,
      role: 'super',
    },
  });

  cachedSuperUserId = user.id;
  return cachedSuperUserId;
}
