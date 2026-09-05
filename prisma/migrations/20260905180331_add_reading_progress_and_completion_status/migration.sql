-- CreateEnum
CREATE TYPE "NovelCompletionStatus" AS ENUM ('ONGOING', 'COMPLETED');

-- AlterTable
ALTER TABLE "novels" ADD COLUMN     "completionStatus" "NovelCompletionStatus";

-- CreateTable
CREATE TABLE "reading_progress" (
    "id" SERIAL NOT NULL,
    "readerId" TEXT NOT NULL,
    "novelId" INTEGER NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reading_progress_readerId_idx" ON "reading_progress"("readerId");

-- CreateIndex
CREATE UNIQUE INDEX "reading_progress_readerId_novelId_key" ON "reading_progress"("readerId", "novelId");

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
