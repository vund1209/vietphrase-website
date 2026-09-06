-- DropIndex
DROP INDEX "reading_progress_readerId_idx";

-- DropIndex
DROP INDEX "reading_progress_readerId_novelId_key";

-- AlterTable
ALTER TABLE "reading_progress" DROP COLUMN "readerId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "reading_progress_userId_idx" ON "reading_progress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reading_progress_userId_novelId_key" ON "reading_progress"("userId", "novelId");

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

