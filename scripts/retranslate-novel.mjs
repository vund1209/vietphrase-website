#!/usr/bin/env node
// One-off utility: recompute a novel's title/description and every
// scraped chapter's title/translatedText using the current tokenizer
// (e.g. after a tokenizer fix like sentence capitalization). Reuses
// existing rawText/originalTitle/originalDescription -- never re-scrapes
// the source site.
//
// Usage: node scripts/retranslate-novel.mjs <slug>
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { VietPhraseTokenizer } from "@vietphrase/tokenizer";

const SENTENCE_END_RE = /^[.!?。！？]+$/;

function capitalizeFirstLetter(text) {
  return text.replace(/^([^\p{L}]*)(\p{L})/u, (_, lead, letter) => lead + letter.toUpperCase());
}

function applySentenceCapitalization(tokens) {
  let capitalizeNext = true;
  return tokens.map((t) => {
    const chinese = t.chinese.trim();
    const shouldCapitalize = capitalizeNext;
    if (SENTENCE_END_RE.test(chinese)) {
      capitalizeNext = true;
    } else if (chinese.length > 0) {
      capitalizeNext = false;
    }
    return shouldCapitalize ? { ...t, vietnamese: capitalizeFirstLetter(t.vietnamese) } : t;
  });
}

function translate(tokenizer, text, overrides) {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "";
      const tokens = tokenizer.tokenize(line, { overrides });
      return applySentenceCapitalization(tokens)
        .map((t) => t.vietnamese)
        .join(" ");
    })
    .join("\n");
}

async function main() {
  const [slug] = process.argv.slice(2);
  if (!slug) {
    console.error("Usage: node scripts/retranslate-novel.mjs <slug>");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const novel = await prisma.novel.findUnique({ where: { slug } });
    if (!novel) {
      console.error(`No novel found with slug "${slug}"`);
      process.exit(1);
    }

    const overrideRows = await prisma.name.findMany({
      where: { novelId: novel.id, isActive: true },
      select: { chineseText: true, vietnameseText: true },
    });
    const overrides = new Map(overrideRows.map((r) => [r.chineseText, r.vietnameseText]));

    const dbPath = path.join(process.cwd(), "data", "seed", "dictionary_seed.db");
    const tokenizer = new VietPhraseTokenizer(dbPath);

    const novelData = {};
    if (novel.originalTitle) novelData.title = translate(tokenizer, novel.originalTitle, overrides);
    if (novel.originalDescription)
      novelData.description = translate(tokenizer, novel.originalDescription, overrides);
    if (Object.keys(novelData).length > 0) {
      await prisma.novel.update({ where: { id: novel.id }, data: novelData });
    }

    const chapters = await prisma.chapter.findMany({
      where: { novelId: novel.id },
      select: { id: true, originalTitle: true, rawText: true },
    });

    let updated = 0;
    for (const c of chapters) {
      const data = {};
      if (c.originalTitle) data.title = translate(tokenizer, c.originalTitle, overrides);
      if (c.rawText) data.translatedText = translate(tokenizer, c.rawText, overrides);
      if (Object.keys(data).length === 0) continue;
      await prisma.chapter.update({ where: { id: c.id }, data });
      updated += 1;
    }
    console.log(`Retranslated novel "${slug}" and ${updated} chapter(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
