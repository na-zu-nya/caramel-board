-- Add isStop flag to AutoTagMapping for stoplist management
ALTER TABLE "AutoTagMapping"
ADD COLUMN "isStop" BOOLEAN NOT NULL DEFAULT false;
