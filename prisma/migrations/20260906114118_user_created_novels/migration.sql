-- CreateEnum
CREATE TYPE "NovelOrigin" AS ENUM ('SCRAPED', 'USER_CREATED');

-- CreateEnum
CREATE TYPE "SourceLanguage" AS ENUM ('ZH', 'VI');

-- AlterTable
ALTER TABLE "chapters" ADD COLUMN     "sourceLanguage" "SourceLanguage" NOT NULL DEFAULT 'ZH',
ALTER COLUMN "sourceUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "novels" ADD COLUMN     "origin" "NovelOrigin" NOT NULL DEFAULT 'SCRAPED';

