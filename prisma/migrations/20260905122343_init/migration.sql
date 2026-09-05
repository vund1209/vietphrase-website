-- CreateEnum
CREATE TYPE "NovelStatus" AS ENUM ('PENDING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('PENDING', 'SCRAPED', 'TRANSLATED', 'ERROR');

-- CreateTable
CREATE TABLE "novels" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "sourceUrl" TEXT,
    "coverImageUrl" TEXT,
    "status" "NovelStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" SERIAL NOT NULL,
    "novelId" INTEGER NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rawText" TEXT,
    "translatedText" TEXT,
    "status" "ChapterStatus" NOT NULL DEFAULT 'PENDING',
    "scrapedAt" TIMESTAMP(3),
    "translatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "words" (
    "id" SERIAL NOT NULL,
    "chineseText" TEXT NOT NULL,
    "vietnameseText" TEXT NOT NULL,
    "phraseLength" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "names" (
    "id" SERIAL NOT NULL,
    "chineseText" TEXT NOT NULL,
    "vietnameseText" TEXT NOT NULL,
    "phraseLength" INTEGER NOT NULL,
    "novelId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "names_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pronouns" (
    "id" SERIAL NOT NULL,
    "chineseText" TEXT NOT NULL,
    "vietnameseText" TEXT NOT NULL,
    "phraseLength" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pronouns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hanviet_fallback" (
    "id" SERIAL NOT NULL,
    "chineseChar" TEXT NOT NULL,
    "hanvietReadings" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "hanviet_fallback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_blacklist" (
    "id" SERIAL NOT NULL,
    "pattern" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "scrape_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "novels_slug_key" ON "novels"("slug");

-- CreateIndex
CREATE INDEX "chapters_novelId_idx" ON "chapters"("novelId");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_novelId_chapterNumber_key" ON "chapters"("novelId", "chapterNumber");

-- CreateIndex
CREATE UNIQUE INDEX "words_chineseText_key" ON "words"("chineseText");

-- CreateIndex
CREATE INDEX "words_phraseLength_idx" ON "words"("phraseLength");

-- CreateIndex
CREATE INDEX "names_phraseLength_idx" ON "names"("phraseLength");

-- CreateIndex
CREATE INDEX "names_novelId_idx" ON "names"("novelId");

-- CreateIndex
CREATE UNIQUE INDEX "names_chineseText_novelId_key" ON "names"("chineseText", "novelId");

-- CreateIndex
CREATE UNIQUE INDEX "pronouns_chineseText_key" ON "pronouns"("chineseText");

-- CreateIndex
CREATE UNIQUE INDEX "hanviet_fallback_chineseChar_key" ON "hanviet_fallback"("chineseChar");

-- CreateIndex
CREATE UNIQUE INDEX "scrape_blacklist_pattern_key" ON "scrape_blacklist"("pattern");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "names" ADD CONSTRAINT "names_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
