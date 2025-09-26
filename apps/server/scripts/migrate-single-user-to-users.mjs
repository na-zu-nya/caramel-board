import {PrismaClient} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const summary = {
    favoritesInserted: 0,
    likeActivitiesUpdated: 0,
  };

  const superUserId = await ensureSuperUser(prisma);

  // スタックのお気に入りフラグを StackFavorite に反映（列が存在する場合のみ）
  const [{ exists: hasFavoritedColumn }] = await prisma.$queryRawUnsafe<
    Array<{ exists: boolean }>
  >(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Stack' AND column_name = 'favorited')"
  );

  if (hasFavoritedColumn) {
    const favoritedStacks = await prisma.stack.findMany({
      where: {favorited: true},
      select: {id: true},
    });

    if (favoritedStacks.length > 0) {
      const data = favoritedStacks.map(({id}) => ({userId: superUserId, stackId: id}));
      const result = await prisma.stackFavorite.createMany({
        data,
        skipDuplicates: true,
      });
      summary.favoritesInserted = result.count;
    }
  } else {
    console.log('[migrate-single-user-to-users] Stack.favorited column not found, skip migration of favorites.');
  }

  // LikeActivity の userId を補完
  const likeUpdate = await prisma.likeActivity.updateMany({
    where: {userId: null},
    data: {userId: superUserId},
  });
  summary.likeActivitiesUpdated = likeUpdate.count;

  // Pin の userId を補完
  console.log('[migrate-single-user-to-users] summary:', summary);
}

main()
  .catch((error) => {
    console.error('[migrate-single-user-to-users] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function ensureSuperUser(prismaClient) {
  const superUser = await prismaClient.user.upsert({
    where: {name: 'super'},
    update: {},
    create: {
      name: 'super',
      role: 'super',
    },
  });
  return superUser.id;
}
