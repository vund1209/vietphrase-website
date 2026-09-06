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
import { tokenizeLines, type DisplayToken } from "@/lib/tokenizer";
import { loadOverridesForNovelCached } from "@/lib/overrides";
import { getDictionaryVersion } from "@/lib/dictionaryVersion";
import { ensureDictionaryDb } from "@/lib/dictionaryDb";

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
      // "Thêm bởi" attribution (see the planning doc's section 6) -- null
      // for novels added before embedding required login, or if that
      // account was later deleted (Novel.addedByUserId is SetNull).
      addedByUser: { select: { id: true, email: true } },
      // Preset tags (see the planning doc's section 13) -- small per-novel
      // set, cheap to always include alongside everything else here.
      tags: { include: { tag: true } },
    },
  });
}

export interface ChapterResult {
  chapter: Chapter;
  novel: Pick<Novel, "slug" | "title">;
  /**
   * Per-word breakdown for the interactive reader -- populated only for
   * a Chinese-source chapter (chapter.sourceLanguage === "ZH"). Only the
   * shared dictionary (global + per-novel, both tracks) is applied
   * server-side; a signed-in or anonymous reader's own personal
   * overrides are a client-only concern applied on top once on mount
   * (see src/lib/clientSync.ts and ChapterReader.tsx) -- see the
   * planning doc's section 3 for why the personal tier moved out of the
   * server render path entirely.
   */
  tokens: DisplayToken[][] | null;
  /**
   * Set instead of `tokens` for an already-Vietnamese chapter
   * (chapter.sourceLanguage === "VI", see the planning doc's section 8)
   * -- there's no VietPhrase translation to apply and no per-word
   * dictionary editing that makes sense for content that isn't Chinese
   * source text, so this renders as plain text instead of the
   * interactive per-word reader.
   */
  plainText: string | null;
}

export async function getOrTranslateChapter(
  slug: string,
  chapterNumber: number,
  // Callers that already fetched this novel this request (e.g. the
  // chapter page, which needs it anyway for the chapter-list/TOC) can
  // pass it through to skip a second, redundant `prisma.novel.findUnique`
  // for the same row. Callers with no novel in hand (e.g. the chapter API
  // route) omit this and the lookup below still happens as before.
  preloadedNovel?: Pick<Novel, "id" | "slug" | "title">
): Promise<ChapterResult> {
  // Belt-and-suspenders alongside instrumentation.ts's register() hook:
  // getTokenizer() (src/lib/tokenizer.ts) is synchronous and only trusts
  // that the dictionary download already finished by the time it's
  // called -- if that assumption is ever wrong on a cold serverless
  // instance (observed in production as "unable to open database file"),
  // this closes the race directly at the point of use. Idempotent/fast
  // once the file is already present (two fs.statSync calls).
  await ensureDictionaryDb();

  const novel = preloadedNovel ?? (await prisma.novel.findUnique({ where: { slug } }));
  if (!novel) throw new ChapterNotFoundError("Novel not found");

  // Real, incrementally-tracked view count (see prisma/schema.prisma's
  // Novel.viewCount and the planning doc's section 12 -- "engagement
  // stats... once there's something real to show, not fabricated
  // placeholder numbers"). Fire-and-forget: a dropped increment isn't
  // worth blocking or failing the chapter render over. Deliberately
  // simple -- one increment per chapter request, not deduplicated by
  // reader/session, same coarse-grained "views" semantic most simple
  // view counters use.
  prisma.novel.update({ where: { id: novel.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const chapter = await prisma.chapter.findUnique({
    where: { novelId_chapterNumber: { novelId: novel.id, chapterNumber } },
  });
  if (!chapter) throw new ChapterNotFoundError("Chapter not found");

  const novelSummary = { slug: novel.slug, title: novel.title };

  let rawText = chapter.rawText;
  let updated = chapter;
  if (!rawText) {
    if (!chapter.sourceUrl) {
      // A USER_CREATED chapter always gets its rawText set at creation
      // (manual entry or .txt import, see the planning doc's section 8)
      // -- reaching here with neither rawText nor a sourceUrl to scrape
      // means the row is corrupt, not merely "not yet scraped".
      throw new ScrapeFailedError("Chapter has no content and no source URL to fetch it from");
    }
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

  if (chapter.sourceLanguage === "VI") {
    return { chapter: updated, novel: novelSummary, tokens: null, plainText: rawText };
  }
  const tokens = await tokenizeChapterCached(chapter.id, novel.id, rawText);
  return { chapter: updated, novel: novelSummary, tokens, plainText: null };
}

// --- Process-local cache for the hot chapter-read path -------------------

// The tokenized output of a chapter only depends on its own rawText and
// the shared-dictionary version -- personal overrides are applied
// client-side only (see ChapterResult.tokens's doc comment above), so
// this is safe to reuse across *every* reader viewing the same chapter,
// not just within one reader's session. Mirrors src/lib/overrides.ts's
// novelOverrideCache pattern (process-local, version-gated) applied one
// level further down the same hot path: that cache already avoids
// re-querying the override tables on every view; this avoids re-running
// the actual longest-match tokenize loop too, which is the real
// CPU-bound cost for a long chapter.
//
// Keyed on a cheap hash of rawText (not just chapterId+version) so a
// direct content edit (the owner chapter-edit route, which doesn't bump
// the dictionary version) can never serve stale tokens -- only a
// refetch/edit that actually changes rawText invalidates the entry.
//
// No eviction beyond a hard size cap: like novelOverrideCache, a Vercel
// serverless instance's bounded lifetime already limits how large this
// gets in practice, but unlike that cache (one entry per novel in the
// library, small), this is one entry per *chapter* ever viewed on this
// instance -- a single popular book can have thousands. Clearing the
// whole map past the cap is simpler than LRU bookkeeping and just costs
// a few extra cache misses right after.
const CHAPTER_TOKEN_CACHE_MAX_ENTRIES = 300;
const chapterTokenCache = new Map<
  number,
  { dictionaryVersion: number; rawTextHash: string; tokens: DisplayToken[][] }
>();

function fnv1aHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

async function tokenizeChapterCached(
  chapterId: number,
  novelId: number,
  rawText: string
): Promise<DisplayToken[][]> {
  const [dictionaryVersion, rawTextHash] = [await getDictionaryVersion(), fnv1aHash(rawText)];
  const cached = chapterTokenCache.get(chapterId);
  if (cached && cached.dictionaryVersion === dictionaryVersion && cached.rawTextHash === rawTextHash) {
    return cached.tokens;
  }

  const tokens = await tokenizeChapter(novelId, rawText);
  if (chapterTokenCache.size >= CHAPTER_TOKEN_CACHE_MAX_ENTRIES) chapterTokenCache.clear();
  chapterTokenCache.set(chapterId, { dictionaryVersion, rawTextHash, tokens });
  return tokens;
}

/**
 * Tokenizes a chapter's raw text with the shared dictionary layer only
 * (global + per-novel, both tracks) -- personal overrides are applied
 * client-side on top (see ChapterResult.tokens above). Cheap: an
 * in-memory SQLite tokenize pass over text already in hand, not a
 * re-scrape. Exported for src/app/api/novels/[slug]/chapters/[number]/
 * candidate-names/route.ts, which scans this same shared-only token
 * stream for src/lib/candidateNames.ts's detector.
 *
 * Uses the process-local, dictionary-version-gated cache
 * (loadOverridesForNovelCached) rather than re-querying the override
 * tables on every view -- see src/lib/overrides.ts and the planning
 * doc's section 9.
 */
export async function tokenizeChapter(novelId: number, rawText: string): Promise<DisplayToken[][]> {
  const { translations, capStyles } = await loadOverridesForNovelCached(novelId);
  return tokenizeLines(rawText, translations, capStyles);
}
