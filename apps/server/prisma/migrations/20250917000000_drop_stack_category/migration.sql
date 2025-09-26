-- Drop legacy stack category column and related index
DROP INDEX IF EXISTS "Stack_category_idx";
ALTER TABLE "Stack" DROP COLUMN IF EXISTS "category";
