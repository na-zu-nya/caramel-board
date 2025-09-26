import {PrismaClient} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const summary = {
    stacksMarkedFavorite: 0,
    favoritesInserted: 0,
    favoritesRemoved: 0,
  };

  const superUserId = await ensureSuperUser(prisma);

  const [{ exists: hasFavoritedColumn }] = await prisma.$queryRawUnsafe<
    Array<{ exists: boolean }>
  >(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Stack' AND column_name = 'favorited')"
  );

  if (!hasFavoritedColumn) {
    console.log('[migrate-stack-favorites] Stack.favorited column not found. Skipping migration.');
    console.log('[migrate-stack-favorites] summary:', summary);
    return;
  }

  const favoritedStacks = await prisma.stack.findMany({
    where: {favorited: true},
    select: {id: true},
  });

  summary.stacksMarkedFavorite = favoritedStacks.length;

  const favoritedStackIds = new Set(favoritedStacks.map(({id}) => id));

  const existingFavorites = await prisma.stackFavorite.findMany({
    where: {userId: superUserId},
    select: {id: true, stackId: true},
  });

  const existingFavoriteStackIds = new Set(existingFavorites.map(({stackId}) => stackId));

  const favoritesToInsert = favoritedStacks
    .filter(({id}) => !existingFavoriteStackIds.has(id))
    .map(({id}) => ({userId: superUserId, stackId: id}));

  if (favoritesToInsert.length > 0) {
    const result = await prisma.stackFavorite.createMany({
      data: favoritesToInsert,
      skipDuplicates: true,
    });
    summary.favoritesInserted = result.count;
  }

  const favoriteIdsToRemove = existingFavorites
    .filter(({stackId}) => !favoritedStackIds.has(stackId))
    .map(({id}) => id);

  if (favoriteIdsToRemove.length > 0) {
    const result = await prisma.stackFavorite.deleteMany({
      where: {id: {in: favoriteIdsToRemove}},
    });
    summary.favoritesRemoved = result.count;
  }

  console.log('[migrate-stack-favorites] summary:', summary);
}

main()
  .catch((error) => {
    console.error('[migrate-stack-favorites] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function ensureSuperUser(prismaClient) {
  const user = await prismaClient.user.upsert({
    where: {name: 'super'},
    update: {},
    create: {
      name: 'super',
      role: 'super',
    },
  });
  return user.id;
}
