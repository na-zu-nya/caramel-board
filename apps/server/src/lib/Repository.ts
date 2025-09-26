import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  // log: ['query']
});

export function getPrisma() {
  return prisma;
}
