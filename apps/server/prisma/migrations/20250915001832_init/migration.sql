-- CreateEnum
CREATE TYPE "CollectionType" AS ENUM ('SMART', 'MANUAL', 'SCRATCH');

-- CreateEnum
CREATE TYPE "NavigationPinType" AS ENUM ('COLLECTION', 'MEDIA_TYPE', 'OVERVIEW', 'FAVORITES', 'LIKES');

-- CreateTable
CREATE TABLE "DataSet" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT DEFAULT '📁',
    "themeColor" TEXT DEFAULT 'oklch(0.646 0.222 41.116)',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "passwordSalt" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DataSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stack" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "thumbnail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,
    "meta" JSONB,
    "category" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'image',
    "liked" INTEGER NOT NULL DEFAULT 0,
    "favorited" BOOLEAN NOT NULL DEFAULT false,
    "authorId" INTEGER,
    "dataSetId" INTEGER NOT NULL,
    "dominantColors" JSONB,

    CONSTRAINT "Stack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "file" TEXT NOT NULL,
    "thumbnail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileType" TEXT NOT NULL,
    "meta" JSONB,
    "originalName" TEXT NOT NULL,
    "stackId" INTEGER NOT NULL,
    "updateAt" TIMESTAMP(3) NOT NULL,
    "hash" TEXT NOT NULL,
    "orderInStack" INTEGER NOT NULL DEFAULT 0,
    "dominantColors" JSONB,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Author" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "dataSetId" INTEGER NOT NULL,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "dataSetId" INTEGER NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagsOnStack" (
    "stackId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "TagsOnStack_pkey" PRIMARY KEY ("stackId","tagId")
);

-- CreateTable
CREATE TABLE "LikeActivity" (
    "id" SERIAL NOT NULL,
    "stackId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LikeActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoTagPrediction" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "tags" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "tagCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoTagPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StackAutoTagAggregate" (
    "id" SERIAL NOT NULL,
    "stackId" INTEGER NOT NULL,
    "aggregatedTags" JSONB NOT NULL,
    "topTags" JSONB NOT NULL,
    "assetCount" INTEGER NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StackAutoTagAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoTagMapping" (
    "id" SERIAL NOT NULL,
    "autoTagKey" TEXT NOT NULL,
    "tagId" INTEGER,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dataSetId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoTagMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📂',
    "description" TEXT,
    "type" "CollectionType" NOT NULL DEFAULT 'MANUAL',
    "dataSetId" INTEGER NOT NULL,
    "folderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "filterConfig" JSONB,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionFolder" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📁',
    "description" TEXT,
    "dataSetId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionStack" (
    "collectionId" INTEGER NOT NULL,
    "stackId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionStack_pkey" PRIMARY KEY ("collectionId","stackId")
);

-- CreateTable
CREATE TABLE "Pin" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'oklch(0.646 0.222 41.116)',
    "stackId" INTEGER NOT NULL,
    "dataSetId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NavigationPin" (
    "id" SERIAL NOT NULL,
    "type" "NavigationPinType" NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "dataSetId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "collectionId" INTEGER,
    "mediaType" TEXT,

    CONSTRAINT "NavigationPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StackColor" (
    "id" SERIAL NOT NULL,
    "stackId" INTEGER NOT NULL,
    "r" INTEGER NOT NULL,
    "g" INTEGER NOT NULL,
    "b" INTEGER NOT NULL,
    "hex" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "hue" INTEGER NOT NULL,
    "saturation" INTEGER NOT NULL,
    "lightness" INTEGER NOT NULL,
    "hueCategory" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StackColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetColor" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "r" INTEGER NOT NULL,
    "g" INTEGER NOT NULL,
    "b" INTEGER NOT NULL,
    "hex" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "hue" INTEGER NOT NULL,
    "saturation" INTEGER NOT NULL,
    "lightness" INTEGER NOT NULL,
    "hueCategory" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetColor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataSet_name_key" ON "DataSet"("name");

-- CreateIndex
CREATE INDEX "Stack_authorId_idx" ON "Stack"("authorId");

-- CreateIndex
CREATE INDEX "Stack_category_idx" ON "Stack"("category");

-- CreateIndex
CREATE INDEX "Stack_mediaType_idx" ON "Stack"("mediaType");

-- CreateIndex
CREATE INDEX "Stack_createdAt_idx" ON "Stack"("createdAt");

-- CreateIndex
CREATE INDEX "Stack_dataSetId_idx" ON "Stack"("dataSetId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_file_key" ON "Asset"("file");

-- CreateIndex
CREATE INDEX "Asset_stackId_idx" ON "Asset"("stackId");

-- CreateIndex
CREATE INDEX "Asset_hash_idx" ON "Asset"("hash");

-- CreateIndex
CREATE INDEX "Author_dataSetId_idx" ON "Author"("dataSetId");

-- CreateIndex
CREATE UNIQUE INDEX "Author_name_dataSetId_key" ON "Author"("name", "dataSetId");

-- CreateIndex
CREATE INDEX "Tag_dataSetId_idx" ON "Tag"("dataSetId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_title_dataSetId_key" ON "Tag"("title", "dataSetId");

-- CreateIndex
CREATE INDEX "TagsOnStack_tagId_idx" ON "TagsOnStack"("tagId");

-- CreateIndex
CREATE INDEX "LikeActivity_stackId_idx" ON "LikeActivity"("stackId");

-- CreateIndex
CREATE INDEX "LikeActivity_createdAt_idx" ON "LikeActivity"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutoTagPrediction_assetId_key" ON "AutoTagPrediction"("assetId");

-- CreateIndex
CREATE INDEX "AutoTagPrediction_assetId_idx" ON "AutoTagPrediction"("assetId");

-- CreateIndex
CREATE INDEX "AutoTagPrediction_createdAt_idx" ON "AutoTagPrediction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StackAutoTagAggregate_stackId_key" ON "StackAutoTagAggregate"("stackId");

-- CreateIndex
CREATE INDEX "StackAutoTagAggregate_stackId_idx" ON "StackAutoTagAggregate"("stackId");

-- CreateIndex
CREATE INDEX "StackAutoTagAggregate_createdAt_idx" ON "StackAutoTagAggregate"("createdAt");

-- CreateIndex
CREATE INDEX "AutoTagMapping_dataSetId_idx" ON "AutoTagMapping"("dataSetId");

-- CreateIndex
CREATE INDEX "AutoTagMapping_tagId_idx" ON "AutoTagMapping"("tagId");

-- CreateIndex
CREATE INDEX "AutoTagMapping_isActive_idx" ON "AutoTagMapping"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AutoTagMapping_autoTagKey_dataSetId_key" ON "AutoTagMapping"("autoTagKey", "dataSetId");

-- CreateIndex
CREATE INDEX "Collection_dataSetId_idx" ON "Collection"("dataSetId");

-- CreateIndex
CREATE INDEX "Collection_folderId_idx" ON "Collection"("folderId");

-- CreateIndex
CREATE INDEX "Collection_type_idx" ON "Collection"("type");

-- CreateIndex
CREATE INDEX "Collection_createdAt_idx" ON "Collection"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_name_dataSetId_key" ON "Collection"("name", "dataSetId");

-- CreateIndex
CREATE INDEX "CollectionFolder_dataSetId_idx" ON "CollectionFolder"("dataSetId");

-- CreateIndex
CREATE INDEX "CollectionFolder_parentId_idx" ON "CollectionFolder"("parentId");

-- CreateIndex
CREATE INDEX "CollectionFolder_order_idx" ON "CollectionFolder"("order");

-- CreateIndex
CREATE INDEX "CollectionFolder_createdAt_idx" ON "CollectionFolder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionFolder_name_dataSetId_parentId_key" ON "CollectionFolder"("name", "dataSetId", "parentId");

-- CreateIndex
CREATE INDEX "CollectionStack_collectionId_idx" ON "CollectionStack"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionStack_stackId_idx" ON "CollectionStack"("stackId");

-- CreateIndex
CREATE INDEX "CollectionStack_orderIndex_idx" ON "CollectionStack"("orderIndex");

-- CreateIndex
CREATE INDEX "Pin_dataSetId_idx" ON "Pin"("dataSetId");

-- CreateIndex
CREATE INDEX "Pin_stackId_idx" ON "Pin"("stackId");

-- CreateIndex
CREATE INDEX "Pin_createdAt_idx" ON "Pin"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Pin_stackId_dataSetId_key" ON "Pin"("stackId", "dataSetId");

-- CreateIndex
CREATE INDEX "NavigationPin_dataSetId_idx" ON "NavigationPin"("dataSetId");

-- CreateIndex
CREATE INDEX "NavigationPin_order_idx" ON "NavigationPin"("order");

-- CreateIndex
CREATE UNIQUE INDEX "NavigationPin_type_dataSetId_collectionId_mediaType_key" ON "NavigationPin"("type", "dataSetId", "collectionId", "mediaType");

-- CreateIndex
CREATE INDEX "StackColor_stackId_idx" ON "StackColor"("stackId");

-- CreateIndex
CREATE INDEX "StackColor_hueCategory_idx" ON "StackColor"("hueCategory");

-- CreateIndex
CREATE INDEX "StackColor_hue_idx" ON "StackColor"("hue");

-- CreateIndex
CREATE INDEX "StackColor_saturation_lightness_idx" ON "StackColor"("saturation", "lightness");

-- CreateIndex
CREATE INDEX "StackColor_hex_idx" ON "StackColor"("hex");

-- CreateIndex
CREATE INDEX "AssetColor_assetId_idx" ON "AssetColor"("assetId");

-- CreateIndex
CREATE INDEX "AssetColor_hueCategory_idx" ON "AssetColor"("hueCategory");

-- CreateIndex
CREATE INDEX "AssetColor_hue_idx" ON "AssetColor"("hue");

-- CreateIndex
CREATE INDEX "AssetColor_saturation_lightness_idx" ON "AssetColor"("saturation", "lightness");

-- CreateIndex
CREATE INDEX "AssetColor_hex_idx" ON "AssetColor"("hex");

-- AddForeignKey
ALTER TABLE "Stack" ADD CONSTRAINT "Stack_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stack" ADD CONSTRAINT "Stack_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Author" ADD CONSTRAINT "Author_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsOnStack" ADD CONSTRAINT "TagsOnStack_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsOnStack" ADD CONSTRAINT "TagsOnStack_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikeActivity" ADD CONSTRAINT "LikeActivity_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoTagPrediction" ADD CONSTRAINT "AutoTagPrediction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StackAutoTagAggregate" ADD CONSTRAINT "StackAutoTagAggregate_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoTagMapping" ADD CONSTRAINT "AutoTagMapping_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoTagMapping" ADD CONSTRAINT "AutoTagMapping_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "CollectionFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionFolder" ADD CONSTRAINT "CollectionFolder_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionFolder" ADD CONSTRAINT "CollectionFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CollectionFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionStack" ADD CONSTRAINT "CollectionStack_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionStack" ADD CONSTRAINT "CollectionStack_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationPin" ADD CONSTRAINT "NavigationPin_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationPin" ADD CONSTRAINT "NavigationPin_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StackColor" ADD CONSTRAINT "StackColor_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetColor" ADD CONSTRAINT "AssetColor_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
