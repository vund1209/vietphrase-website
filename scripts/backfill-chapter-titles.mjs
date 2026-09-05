#!/usr/bin/env node
// One-off utility: backfill originalTitle/sourceChapterId + a translated
// title for chapters that predate that split (e.g. chapters inserted by
// a direct re-scrape/fix script that bypassed the app's normal
// POST /api/novels create path, which sets these at insert time). Only
// touches chapters where originalTitle is still null.
//
// Usage: node scripts/backfill-chapter-titles.mjs <slug>
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { VietPhraseTokenizer } from "@vietphrase/tokenizer";

function extractSourceChapterId(chapterUrl) {
  const match = chapterUrl.match(/(\d+)\/?$/);
  return match ? match[1] : null;
}

async function main() {
  const [slug] = process.argv.slice(2);
  if (!slug) {
    console.error("Usage: node scripts/backfill-chapter-titles.mjs <slug>");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true } });
    if (!novel) {
      console.error(`No novel found with slug "${slug}"`);
      process.exit(1);
    }

    const chapters = await prisma.chapter.findMany({
      where: { novelId: novel.id, originalTitle: null },
      select: { id: true, title: true, sourceUrl: true },
    });
    if (chapters.length === 0) {
      console.log("Nothing to backfill -- every chapter already has an originalTitle.");
      return;
    }

    const overrideRows = await prisma.name.findMany({
      where: { novelId: novel.id, isActive: true },
      select: { chineseText: true, vietnameseText: true },
    });
    const overrides = new Map(overrideRows.map((r) => [r.chineseText, r.vietnameseText]));

    const dbPath = path.join(process.cwd(), "data", "seed", "dictionary_seed.db");
    const tokenizer = new VietPhraseTokenizer(dbPath);
    const translate = (text) =>
      tokenizer
        .tokenize(text, { overrides })
        .map((t) => t.vietnamese)
        .join(" ");

    let updated = 0;
    for (const c of chapters) {
      await prisma.chapter.update({
        where: { id: c.id },
        data: {
          originalTitle: c.title,
          sourceChapterId: extractSourceChapterId(c.sourceUrl),
          title: translate(c.title),
        },
      });
      updated += 1;
    }
    console.log(`Backfilled ${updated} chapter(s) for "${slug}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
