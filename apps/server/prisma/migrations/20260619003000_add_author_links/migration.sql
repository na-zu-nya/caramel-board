-- CreateTable
CREATE TABLE "AuthorLink" (
    "id" SERIAL NOT NULL,
    "authorId" INTEGER NOT NULL,
    "provider" TEXT,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "externalId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthorLink_authorId_idx" ON "AuthorLink"("authorId");

-- CreateIndex
CREATE INDEX "AuthorLink_provider_externalId_idx" ON "AuthorLink"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "AuthorLink" ADD CONSTRAINT "AuthorLink_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE CASCADE ON UPDATE CASCADE;
