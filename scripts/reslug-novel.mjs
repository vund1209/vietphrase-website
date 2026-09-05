#!/usr/bin/env node
// One-off utility: re-slug an existing novel to the URL-based scheme
// (see src/lib/slug.ts's slugFromSourceUrl) -- for novels added before
// that change, whose slug was derived from the scraped page title
// instead. Safe because nothing has a foreign key on Novel.slug (only
// novelId), so this is a plain column update.
//
// Usage: node scripts/reslug-novel.mjs <current-slug>
import { PrismaClient } from "@prisma/client";

async function main() {
  const [currentSlug] = process.argv.slice(2);
  if (!currentSlug) {
    console.error("Usage: node scripts/reslug-novel.mjs <current-slug>");
    process.exit(1);
  }

  // Inline copy of slugFromSourceUrl (src/lib/slug.ts is TS/ESM within
  // the app; kept dependency-free here so this plain Node script runs
  // without a build step).
  function slugify(title) {
    const ascii = title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return ascii || `truyen-${Math.random().toString(16).slice(2, 8)}`;
  }
  function slugFromSourceUrl(url) {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const labels = host.split(".");
    const siteLabel = labels.length > 1 ? labels[labels.length - 2] : labels[0];
    const idSegment = u.pathname.split("/").find((seg) => /^\d+$/.test(seg));
    const base = idSegment ? `${siteLabel}-${idSegment}` : `${siteLabel}-${u.pathname}`;
    return slugify(base);
  }

  const prisma = new PrismaClient();
  try {
    const novel = await prisma.novel.findUnique({ where: { slug: currentSlug } });
    if (!novel) {
      console.error(`No novel found with slug "${currentSlug}"`);
      process.exit(1);
    }
    if (!novel.sourceUrl) {
      console.error(`Novel "${currentSlug}" has no sourceUrl to derive a new slug from.`);
      process.exit(1);
    }

    let newSlug = slugFromSourceUrl(novel.sourceUrl);
    if (newSlug !== currentSlug) {
      let attempt = 0;
      let candidate = newSlug;
      while (await prisma.novel.findFirst({ where: { slug: candidate, id: { not: novel.id } } })) {
        attempt += 1;
        candidate = `${newSlug}-${attempt + 1}`;
      }
      newSlug = candidate;
      await prisma.novel.update({ where: { id: novel.id }, data: { slug: newSlug } });
    }
    console.log(`Re-slugged: "${currentSlug}" -> "${newSlug}" (sourceUrl: ${novel.sourceUrl})`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
