#!/usr/bin/env node
// One-off utility: re-fetch a novel's source landing page and backfill
// description/coverImageUrl/author/originalTitle + a translated title --
// for novels added before Phase 4's metadata-scraping change, whose
// these columns are still null. Does not touch chapters.
//
// Usage: node scripts/backfill-novel-metadata.mjs <slug>
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { VietPhraseTokenizer } from "@vietphrase/tokenizer";

function extractMetaContent(html, ...patterns) {
  for (const re of patterns) {
    const match = html.match(re);
    if (match) {
      const value = match[1].trim();
      if (value) return value;
    }
  }
  return null;
}

function extractPageTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() || null : null;
}

function extractDescription(html) {
  return extractMetaContent(
    html,
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:description["'][^>]*>/i,
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i
  );
}

function extractCoverImageUrl(html) {
  return extractMetaContent(
    html,
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:image["'][^>]*>/i
  );
}

function extractAuthor(html) {
  return extractMetaContent(
    html,
    /<meta[^>]+name=["']author["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']author["'][^>]*>/i
  );
}

async function main() {
  const [slug] = process.argv.slice(2);
  if (!slug) {
    console.error("Usage: node scripts/backfill-novel-metadata.mjs <slug>");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const novel = await prisma.novel.findUnique({ where: { slug } });
    if (!novel) {
      console.error(`No novel found with slug "${slug}"`);
      process.exit(1);
    }
    if (!novel.sourceUrl) {
      console.error(`Novel "${slug}" has no sourceUrl.`);
      process.exit(1);
    }

    const res = await fetch(novel.sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    const html = await res.text();

    const originalTitle = extractPageTitle(html)?.trim() || novel.title;
    const description = extractDescription(html);
    const coverImageUrl = extractCoverImageUrl(html);
    const author = extractAuthor(html);

    const dbPath = path.join(process.cwd(), "data", "seed", "dictionary_seed.db");
    const tokenizer = new VietPhraseTokenizer(dbPath);
    const title = tokenizer
      .tokenize(originalTitle, {})
      .map((t) => t.vietnamese)
      .join(" ");

    const updated = await prisma.novel.update({
      where: { id: novel.id },
      data: { originalTitle, title, description, coverImageUrl, author },
    });
    console.log("Backfilled:", JSON.stringify(updated, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main();
