CREATE TABLE "AssetFavorite" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetFavorite_userId_assetId_key" ON "AssetFavorite"("userId", "assetId");
CREATE INDEX "AssetFavorite_userId_idx" ON "AssetFavorite"("userId");
CREATE INDEX "AssetFavorite_assetId_idx" ON "AssetFavorite"("assetId");
CREATE INDEX "AssetFavorite_createdAt_idx" ON "AssetFavorite"("createdAt");

ALTER TABLE "AssetFavorite" ADD CONSTRAINT "AssetFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetFavorite" ADD CONSTRAINT "AssetFavorite_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
