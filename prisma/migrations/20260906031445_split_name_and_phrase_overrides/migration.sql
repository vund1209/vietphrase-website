-- CreateTable
CREATE TABLE "novel_word_overrides" (
    "id" SERIAL NOT NULL,
    "chineseText" TEXT NOT NULL,
    "vietnameseText" TEXT NOT NULL,
    "capStyle" "NameCapStyle" NOT NULL DEFAULT 'NONE',
    "phraseLength" INTEGER NOT NULL,
    "novelId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "promotedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "novel_word_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_name_overrides" (
    "id" SERIAL NOT NULL,
    "chineseText" TEXT NOT NULL,
    "vietnameseText" TEXT NOT NULL,
    "capStyle" "NameCapStyle" NOT NULL DEFAULT 'NONE',
    "phraseLength" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_name_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_name_overrides" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "novelId" INTEGER NOT NULL,
    "chineseText" TEXT NOT NULL,
    "vietnameseText" TEXT NOT NULL,
    "capStyle" "NameCapStyle" NOT NULL DEFAULT 'NONE',
    "phraseLength" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_name_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "novel_word_overrides_phraseLength_idx" ON "novel_word_overrides"("phraseLength");

-- CreateIndex
CREATE INDEX "novel_word_overrides_novelId_idx" ON "novel_word_overrides"("novelId");

-- CreateIndex
CREATE UNIQUE INDEX "novel_word_overrides_chineseText_novelId_key" ON "novel_word_overrides"("chineseText", "novelId");

-- CreateIndex
CREATE UNIQUE INDEX "global_name_overrides_chineseText_key" ON "global_name_overrides"("chineseText");

-- CreateIndex
CREATE INDEX "global_name_overrides_phraseLength_idx" ON "global_name_overrides"("phraseLength");

-- CreateIndex
CREATE INDEX "user_name_overrides_novelId_phraseLength_idx" ON "user_name_overrides"("novelId", "phraseLength");

-- CreateIndex
CREATE UNIQUE INDEX "user_name_overrides_userId_novelId_chineseText_key" ON "user_name_overrides"("userId", "novelId", "chineseText");

-- AddForeignKey
ALTER TABLE "novel_word_overrides" ADD CONSTRAINT "novel_word_overrides_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novel_word_overrides" ADD CONSTRAINT "novel_word_overrides_promotedByUserId_fkey" FOREIGN KEY ("promotedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_name_overrides" ADD CONSTRAINT "global_name_overrides_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_name_overrides" ADD CONSTRAINT "user_name_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_name_overrides" ADD CONSTRAINT "user_name_overrides_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
