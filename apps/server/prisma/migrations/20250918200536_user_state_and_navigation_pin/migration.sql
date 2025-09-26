/*
  Warnings:

  - A unique constraint covering the columns `[userId,type,dataSetId,collectionId,mediaType]` on the table `NavigationPin` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,stackId,dataSetId]` on the table `Pin` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `NavigationPin` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Pin` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX IF EXISTS "NavigationPin_type_dataSetId_collectionId_mediaType_key";

-- DropIndex
DROP INDEX IF EXISTS "Pin_stackId_dataSetId_key";

-- AlterTable
ALTER TABLE "LikeActivity" ADD COLUMN IF NOT EXISTS "userId" INTEGER;

-- AlterTable
ALTER TABLE "NavigationPin" ADD COLUMN IF NOT EXISTS "userId" INTEGER;

-- AlterTable
ALTER TABLE "Pin" ADD COLUMN IF NOT EXISTS "userId" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StackFavorite" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "stackId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StackFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'super',
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StackFavorite_userId_idx" ON "StackFavorite"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StackFavorite_stackId_idx" ON "StackFavorite"("stackId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StackFavorite_userId_stackId_key" ON "StackFavorite"("userId", "stackId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LikeActivity_userId_idx" ON "LikeActivity"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NavigationPin_userId_idx" ON "NavigationPin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NavigationPin_userId_type_dataSetId_collectionId_mediaType_key" ON "NavigationPin"("userId", "type", "dataSetId", "collectionId", "mediaType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pin_userId_idx" ON "Pin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Pin_userId_stackId_dataSetId_key" ON "Pin"("userId", "stackId", "dataSetId");

-- AddForeignKey
ALTER TABLE "LikeActivity" DROP CONSTRAINT IF EXISTS "LikeActivity_userId_fkey";
ALTER TABLE "LikeActivity" ADD CONSTRAINT "LikeActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" DROP CONSTRAINT IF EXISTS "Pin_userId_fkey";
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StackFavorite" DROP CONSTRAINT IF EXISTS "StackFavorite_userId_fkey";
ALTER TABLE "StackFavorite" ADD CONSTRAINT "StackFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StackFavorite" DROP CONSTRAINT IF EXISTS "StackFavorite_stackId_fkey";
ALTER TABLE "StackFavorite" ADD CONSTRAINT "StackFavorite_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationPin" DROP CONSTRAINT IF EXISTS "NavigationPin_userId_fkey";
ALTER TABLE "NavigationPin" ADD CONSTRAINT "NavigationPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ensure super user exists and backfill userId columns
INSERT INTO "User" ("id", "name", "role", "createdAt", "updatedAt")
VALUES (1, 'super', 'super', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "Pin" SET "userId" = 1 WHERE "userId" IS NULL;
UPDATE "NavigationPin" SET "userId" = 1 WHERE "userId" IS NULL;
UPDATE "LikeActivity" SET "userId" = 1 WHERE "userId" IS NULL;

ALTER TABLE "Pin" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "NavigationPin" ALTER COLUMN "userId" SET NOT NULL;
