-- Data fix first, while the column still uses the original enum type:
-- no chapter should be left on a status value we're about to remove.
UPDATE "chapters" SET "status" = 'SCRAPED' WHERE "status" = 'TRANSLATED';

-- Postgres can't DROP a value from an enum directly -- recreate the type.
ALTER TYPE "ChapterStatus" RENAME TO "ChapterStatus_old";
CREATE TYPE "ChapterStatus" AS ENUM ('PENDING', 'SCRAPED', 'ERROR');
ALTER TABLE "chapters" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "chapters" ALTER COLUMN "status" TYPE "ChapterStatus" USING ("status"::text::"ChapterStatus");
ALTER TABLE "chapters" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "ChapterStatus_old";

-- VietPhrase translation is now a render-time layer over rawText (see
-- src/lib/novels.ts) -- no separately cached translated copy.
ALTER TABLE "chapters" DROP COLUMN "translatedText";
ALTER TABLE "chapters" DROP COLUMN "translatedAt";

-- Per-entry capitalization style (see src/lib/tokenizer.ts's applyCapStyle).
CREATE TYPE "NameCapStyle" AS ENUM ('NONE', 'FIRST_LETTER', 'ALL_WORDS');
ALTER TABLE "names" ADD COLUMN "capStyle" "NameCapStyle" NOT NULL DEFAULT 'NONE';
ALTER TABLE "user_word_overrides" ADD COLUMN "capStyle" "NameCapStyle" NOT NULL DEFAULT 'NONE';
