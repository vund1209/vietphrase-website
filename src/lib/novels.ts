// Shared data-access + lazy scrape/render logic for the reading library,
// used by both the API routes (src/app/api/novels/...) and the reader
// page's server component directly, so the two don't duplicate this
// logic. See docs/ARCHITECTURE.md "Scrape timing: lazy, on first view"
// and "User management and per-word overrides".
//
// VietPhrase translation is a render-time layer over Chapter.rawText,
// not a separately cached value -- see prisma/schema.prisma's Chapter
// doc comment. That means there's nothing to invalidate when a
// dictionary entry changes; the next view just renders differently.
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
   * Flat rendered text for an anonymous reader -- computed fresh from
   * `chapter.rawText` on every request, never stored.
   */
  translatedText?: string;
  /**
   * Per-word breakdown for the interactive reader, populated only for a
   * signed-in reader (see docs/ARCHITECTURE.md "User management and
   * per-word overrides"), also computed fresh each request.
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

  let rawText = chapter.rawText;
  let updated = chapter;
  if (!rawText) {
    try {
      const fetched = await fetchChapterContent(chapter.sourceUrl);
      rawText = fetched.rawText;
    } catch (err) {
      await prisma.chapter.update({ where: { id: chapter.id }, data: { status: "ERROR" } });
      throw new ScrapeFailedError(
        err instanceof Error ? err.message : "Failed to scrape chapter"
      );
    }
    updated = await prisma.chapter.update({
      where: { id: chapter.id },
      data: { rawText, status: "SCRAPED", scrapedAt: new Date() },
    });
  }

  if (userId === undefined) {
    const { translations, capStyles } = await loadNovelOverrides(novel.id);
    const translatedText = translateText(rawText, translations, capStyles);
    return { chapter: updated, novel: novelSummary, translatedText };
  }
  const tokens = await tokenizeForReader(novel.id, userId, rawText);
  return { chapter: updated, novel: novelSummary, tokens };
}

/**
 * Re-tokenizes a chapter's raw text with this specific reader's override
 * layer (shared dictionary + their own private overrides). Cheap: an
 * in-memory SQLite tokenize pass over text already in hand, not a
 * re-scrape -- see docs/ARCHITECTURE.md "User management and per-word
 * overrides".
 */
async function tokenizeForReader(
  novelId: number,
  userId: number,
  rawText: string
): Promise<DisplayToken[][]> {
  const { translations, capStyles } = await loadOverridesForUser(novelId, userId);
  return tokenizeLines(rawText, translations, capStyles);
}
