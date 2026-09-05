-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "chapters" ADD COLUMN     "originalTitle" TEXT,
ADD COLUMN     "sourceChapterId" TEXT;

-- AlterTable
ALTER TABLE "novels" ADD COLUMN     "description" TEXT,
ADD COLUMN     "originalTitle" TEXT;
