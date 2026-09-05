-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('READER', 'EDITOR');

-- AlterTable
ALTER TABLE "names" ADD COLUMN     "promotedByUserId" INTEGER;

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'READER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_word_overrides" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "novelId" INTEGER NOT NULL,
    "chineseText" TEXT NOT NULL,
    "vietnameseText" TEXT NOT NULL,
    "phraseLength" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_word_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_word_overrides_novelId_phraseLength_idx" ON "user_word_overrides"("novelId", "phraseLength");

-- CreateIndex
CREATE UNIQUE INDEX "user_word_overrides_userId_novelId_chineseText_key" ON "user_word_overrides"("userId", "novelId", "chineseText");

-- AddForeignKey
ALTER TABLE "names" ADD CONSTRAINT "names_promotedByUserId_fkey" FOREIGN KEY ("promotedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_word_overrides" ADD CONSTRAINT "user_word_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_word_overrides" ADD CONSTRAINT "user_word_overrides_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
