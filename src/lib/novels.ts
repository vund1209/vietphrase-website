// Shared data-access + lazy scrape/translate logic for the reading
// library, used by both the API routes (src/app/api/novels/...) and the
// reader page's server component directly, so the two don't duplicate
// this logic. See docs/ARCHITECTURE.md "Scrape timing: lazy, on first
// view".
import type { Chapter, Novel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchChapterContent } from "@/lib/scraper";
import { translateText } from "@/lib/tokenizer";
import { loadNovelOverrides } from "@/lib/overrides";

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
}

export async function getOrTranslateChapter(
  slug: string,
  chapterNumber: number
): Promise<ChapterResult> {
  const novel = await prisma.novel.findUnique({ where: { slug } });
  if (!novel) throw new ChapterNotFoundError("Novel not found");

  const chapter = await prisma.chapter.findUnique({
    where: { novelId_chapterNumber: { novelId: novel.id, chapterNumber } },
  });
  if (!chapter) throw new ChapterNotFoundError("Chapter not found");

  // Cache hit: already scraped and translated on a previous view.
  if (chapter.status === "TRANSLATED" && chapter.translatedText) {
    return { chapter, novel: { slug: novel.slug, title: novel.title } };
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

  const overrides = await loadNovelOverrides(novel.id);
  const translatedText = translateText(rawText, overrides);

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

  return { chapter: updated, novel: { slug: novel.slug, title: novel.title } };
}
