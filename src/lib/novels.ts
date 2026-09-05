// Shared data-access + lazy scrape/translate logic for the reading
// library, used by both the API routes (src/app/api/novels/...) and the
// reader page's server component directly, so the two don't duplicate
// this logic. See docs/ARCHITECTURE.md "Scrape timing: lazy, on first
// view" and "User management and per-word overrides".
import type { Chapter, Novel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchChapterContent } from "@/lib/scraper";
import { translateText, tokenizeLines, type DisplayToken } from "@/lib/tokenizer";
import { loadNovelOverrides, loadOverridesForUser } from "@/lib/overrides";

export class ChapterNotFoundError extends Error {}
export class ScrapeFailedError extends Error {}

export function getNovelBySlug(slug: string) {
  return prisma.novel.findUnique({
    where: { slug },
    include: {
      chapters: {
        orderBy: { chapterNumber: "asc" },
        select: { chapterNumber: true, title: true, status: true },
      },
    },
  });
}

export interface ChapterResult {
  chapter: Chapter;
  novel: Pick<Novel, "slug" | "title">;
  /**
   * Per-word breakdown for the interactive reader, populated only for a
   * signed-in reader (see docs/ARCHITECTURE.md "User management and
   * per-word overrides"). Anonymous readers, and any reader with no
   * personal overrides for this novel, get the fast cached
   * `chapter.translatedText` path with no per-token recompute -- `tokens`
   * stays undefined and the caller renders the plain cached text.
   */
  tokens?: DisplayToken[][];
}

export async function getOrTranslateChapter(
  slug: string,
  chapterNumber: number,
  userId?: number
): Promise<ChapterResult> {
  const novel = await prisma.novel.findUnique({ where: { slug } });
  if (!novel) throw new ChapterNotFoundError("Novel not found");

  const chapter = await prisma.chapter.findUnique({
    where: { novelId_chapterNumber: { novelId: novel.id, chapterNumber } },
  });
  if (!chapter) throw new ChapterNotFoundError("Chapter not found");

  const novelSummary = { slug: novel.slug, title: novel.title };

  // Cache hit: already scraped and translated on a previous view. The
  // shared translatedText column is the same for every reader, so an
  // anonymous reader (or one with no personal overrides) can be served
  // it directly with no recompute.
  if (chapter.status === "TRANSLATED" && chapter.translatedText) {
    if (userId === undefined) {
      return { chapter, novel: novelSummary };
    }
    if (!chapter.rawText) {
      // Shouldn't happen -- rawText is always saved alongside
      // translatedText below -- but fall back to the shared text rather
      // than throw if some row predates that invariant.
      return { chapter, novel: novelSummary };
    }
    const tokens = await tokenizeForReader(novel.id, userId, chapter.rawText);
    return { chapter, novel: novelSummary, tokens };
  }

  // Lazy scrape + translate, first view only.
  let rawText: string;
  try {
    const fetched = await fetchChapterContent(chapter.sourceUrl);
    rawText = fetched.rawText;
  } catch (err) {
    await prisma.chapter.update({ where: { id: chapter.id }, data: { status: "ERROR" } });
    throw new ScrapeFailedError(
      err instanceof Error ? err.message : "Failed to scrape chapter"
    );
  }

  const sharedOverrides = await loadNovelOverrides(novel.id);
  const translatedText = translateText(rawText, sharedOverrides);

  const updated = await prisma.chapter.update({
    where: { id: chapter.id },
    data: {
      rawText,
      translatedText,
      status: "TRANSLATED",
      scrapedAt: new Date(),
      translatedAt: new Date(),
    },
  });

  if (userId === undefined) {
    return { chapter: updated, novel: novelSummary };
  }
  const tokens = await tokenizeForReader(novel.id, userId, rawText);
  return { chapter: updated, novel: novelSummary, tokens };
}

/**
 * Re-tokenizes a chapter's raw text with this specific reader's override
 * layer (shared dictionary + their own private overrides). Deliberately
 * NOT cached anywhere: the shared Chapter.translatedText column stays
 * the one cached, editor-curated version everyone else gets; a signed-in
 * reader with personal overrides always gets a fresh per-view render
 * instead, which is cheap (an in-memory SQLite tokenize pass over text
 * already in hand, not a re-scrape) -- see docs/ARCHITECTURE.md "User
 * management and per-word overrides".
 */
async function tokenizeForReader(
  novelId: number,
  userId: number,
  rawText: string
): Promise<DisplayToken[][]> {
  const overrides = await loadOverridesForUser(novelId, userId);
  return tokenizeLines(rawText, overrides);
}
