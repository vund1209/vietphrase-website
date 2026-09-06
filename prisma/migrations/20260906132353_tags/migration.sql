-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novel_tags" (
    "id" SERIAL NOT NULL,
    "novelId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "addedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novel_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "novel_tags_tagId_idx" ON "novel_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "novel_tags_novelId_tagId_key" ON "novel_tags"("novelId", "tagId");

-- AddForeignKey
ALTER TABLE "novel_tags" ADD CONSTRAINT "novel_tags_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novel_tags" ADD CONSTRAINT "novel_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novel_tags" ADD CONSTRAINT "novel_tags_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

