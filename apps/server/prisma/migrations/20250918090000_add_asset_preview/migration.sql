-- Add preview column to Asset for storing converted media previews
ALTER TABLE "Asset"
ADD COLUMN "preview" TEXT;
