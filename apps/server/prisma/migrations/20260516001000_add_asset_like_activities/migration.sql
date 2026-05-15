-- Add optional asset-level context to like activity history.
ALTER TABLE "LikeActivity" ADD COLUMN "assetId" INTEGER;

CREATE INDEX "LikeActivity_assetId_idx" ON "LikeActivity"("assetId");

ALTER TABLE "LikeActivity"
ADD CONSTRAINT "LikeActivity_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
