-- AlterTable
ALTER TABLE "novels" ADD COLUMN     "addedByUserId" INTEGER;

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "id" SERIAL NOT NULL,
    "bucket" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_activity_log" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_buckets_windowStart_idx" ON "rate_limit_buckets"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_buckets_bucket_ipHash_windowStart_key" ON "rate_limit_buckets"("bucket", "ipHash", "windowStart");

-- CreateIndex
CREATE INDEX "admin_activity_log_userId_idx" ON "admin_activity_log"("userId");

-- CreateIndex
CREATE INDEX "admin_activity_log_createdAt_idx" ON "admin_activity_log"("createdAt");

-- CreateIndex
CREATE INDEX "novels_addedByUserId_idx" ON "novels"("addedByUserId");

-- AddForeignKey
ALTER TABLE "novels" ADD CONSTRAINT "novels_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_activity_log" ADD CONSTRAINT "admin_activity_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

