-- CreateTable
CREATE TABLE "global_word_overrides" (
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

    CONSTRAINT "global_word_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "global_word_overrides_chineseText_key" ON "global_word_overrides"("chineseText");

-- CreateIndex
CREATE INDEX "global_word_overrides_phraseLength_idx" ON "global_word_overrides"("phraseLength");

-- AddForeignKey
ALTER TABLE "global_word_overrides" ADD CONSTRAINT "global_word_overrides_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
