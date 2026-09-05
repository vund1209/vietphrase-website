#!/usr/bin/env node
// One-off utility: recompute a novel's title/description and every
// chapter's title using the current tokenizer (e.g. after a tokenizer
// fix like sentence capitalization, or a capStyle change). Reuses
// existing originalTitle/originalDescription -- never re-scrapes the
// source site. Chapter *body* text needs no such step: it's rendered
// live from rawText on every view (see src/lib/novels.ts), so it
// already reflects tokenizer/dictionary changes on the next request.
//
// Usage: node scripts/retranslate-novel.mjs <slug>
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { VietPhraseTokenizer } from "@vietphrase/tokenizer";

const SENTENCE_END_RE = /^[.!?。！？]+$/;

function capitalizeFirstLetter(text) {
  return text.replace(/^([^\p{L}]*)(\p{L})/u, (_, lead, letter) => lead + letter.toUpperCase());
}

function applyCapStyle(text, style) {
  if (style === "ALL_WORDS") {
    return text.replace(/(^|\s)(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase());
  }
  if (style === "FIRST_LETTER") return capitalizeFirstLetter(text);
  return text;
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

function translate(tokenizer, text, overrides, capStyles) {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "";
      let tokens = tokenizer.tokenize(line, { overrides });
      tokens = tokens.map((t) => {
        if (t.source !== "name") return t;
        const style = capStyles.get(t.chinese);
        if (!style || style === "NONE") return t;
        return { ...t, vietnamese: applyCapStyle(t.vietnamese, style) };
      });
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

    const [globalRows, novelRows] = await Promise.all([
      prisma.globalWordOverride.findMany({
        where: { isActive: true },
        select: { chineseText: true, vietnameseText: true, capStyle: true },
      }),
      prisma.name.findMany({
        where: { novelId: novel.id, isActive: true },
        select: { chineseText: true, vietnameseText: true, capStyle: true },
      }),
    ]);
    // Per-novel Name wins over a global override for the same phrase --
    // same precedence as src/lib/overrides.ts's mergeLayers.
    const overrideRows = [...globalRows, ...novelRows];
    const overrides = new Map(overrideRows.map((r) => [r.chineseText, r.vietnameseText]));
    const capStyles = new Map(overrideRows.map((r) => [r.chineseText, r.capStyle]));

    const dbPath = path.join(process.cwd(), "data", "seed", "dictionary_seed.db");
    const tokenizer = new VietPhraseTokenizer(dbPath);

    const novelData = {};
    if (novel.originalTitle)
      novelData.title = translate(tokenizer, novel.originalTitle, overrides, capStyles);
    if (novel.originalDescription)
      novelData.description = translate(tokenizer, novel.originalDescription, overrides, capStyles);
    if (Object.keys(novelData).length > 0) {
      await prisma.novel.update({ where: { id: novel.id }, data: novelData });
    }

    const chapters = await prisma.chapter.findMany({
      where: { novelId: novel.id, originalTitle: { not: null } },
      select: { id: true, originalTitle: true },
    });

    let updated = 0;
    for (const c of chapters) {
      await prisma.chapter.update({
        where: { id: c.id },
        data: { title: translate(tokenizer, c.originalTitle, overrides, capStyles) },
      });
      updated += 1;
    }
    console.log(`Retranslated novel "${slug}" and ${updated} chapter title(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
