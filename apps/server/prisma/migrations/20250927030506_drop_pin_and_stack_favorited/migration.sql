-- Drop Stack.favorited column after migrating data into StackFavorite
INSERT INTO "User" ("id", "name", "role", "createdAt", "updatedAt")
VALUES (1, 'super', 'super', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "StackFavorite" ("userId", "stackId")
SELECT 1, "id" FROM "Stack" WHERE "favorited" = true
ON CONFLICT ("userId", "stackId") DO NOTHING;

ALTER TABLE "Stack" DROP COLUMN IF EXISTS "favorited";

DROP TABLE IF EXISTS "Pin";
