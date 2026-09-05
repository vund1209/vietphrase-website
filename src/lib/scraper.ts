// Top-level scraping entry points used by the API routes: fetch a page,
// dispatch to a per-site adapter if one matches (none exist yet), or the
// generic extractor otherwise. See docs/ARCHITECTURE.md "Scraping
// strategy" and "Scrape timing: lazy, on first view".
import * as cheerio from "cheerio";
import { extractChapterList } from "./extract/chapterList.ts";
import { extractChapterContent } from "./extract/chapterContent.ts";
import { resolveAdapter } from "./extract/adapters.ts";
import { filterBlacklist } from "./blacklist.ts";
import type { ChapterListItem } from "./extract/types";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.text();
}

function extractPageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() || null : null;
}

// Generic, site-agnostic metadata extraction via standard <meta> tags --
// no per-site adapter needed, same nullable-if-absent pattern as
// extractPageTitle above. Confirmed as the right approach by reviewing
// how sangtacviet.com's own embed of book.sfacg.com/Novel/530508/
// displays a description/author and hotlinks a cover image straight from
// the source (http://rs.sfacg.com/...): these are exactly the values a
// well-behaved novel-hosting page already puts in og:description/
// og:image/meta[name=author] for link-preview purposes.
function extractMetaContent(html: string, ...patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const match = html.match(re);
    if (match) {
      const value = match[1].trim();
      if (value) return value;
    }
  }
  return null;
}

function extractDescription(html: string): string | null {
  return extractMetaContent(
    html,
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:description["'][^>]*>/i,
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i
  );
}

function extractCoverImageUrl(html: string): string | null {
  return extractMetaContent(
    html,
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:image["'][^>]*>/i
  );
}

function extractAuthor(html: string): string | null {
  return extractMetaContent(
    html,
    /<meta[^>]+name=["']author["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']author["'][^>]*>/i
  );
}

// Best-effort ID parsed from the tail of a chapter's source URL (e.g. a
// site's own numeric chapter ID) -- reference/dedup only, not used for
// routing. Mirrors how sangtacviet.com's own chapter URLs preserve the
// source site's chapter ID rather than inventing a new one.
export function extractSourceChapterId(chapterUrl: string): string | null {
  const match = chapterUrl.match(/(\d+)\/?$/);
  return match ? match[1] : null;
}

// Real novel sites often split a "book" into a landing/intro page and a
// separate chapter-list (table of contents) page one hop away -- e.g.
// book.sfacg.com links from its landing page to /Novel/<id>/MainIndex/
// via a "点击阅读" link, and 69shuba.com links from /book/<id>.htm to
// /book/<id>/ via a "开始阅读" link. Neither site's link text reliably
// contains an obvious "目录" (table of contents) keyword, so this
// matches on a broader set of href/text signals seen across sites.
const TOC_HREF_RE = /(mainindex|catalog|chapterlist|chapter-list|chapters|mulu|dir)/i;
const TOC_TEXT_RE = /(目录|章节目录|全部章节|章节列表|最新章节|点击阅读|开始阅读|立即阅读|在线阅读)/;

export function findTocLink(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return null;
  }

  let best: string | null = null;
  $("a[href]").each((_, el) => {
    if (best) return;
    const href = $(el).attr("href");
    if (!href) return;
    const text = $(el).text().trim();
    if (!TOC_HREF_RE.test(href) && !TOC_TEXT_RE.test(text)) return;

    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      return;
    }
    if (resolved.origin !== base.origin) return; // same-origin only
    if (resolved.href === base.href) return; // avoid a self-referencing loop
    best = resolved.href;
  });

  return best;
}

export interface FetchedChapterList {
  bookTitle: string | null;
  description: string | null;
  coverImageUrl: string | null;
  author: string | null;
  chapters: ChapterListItem[];
}

export async function fetchChapterList(bookUrl: string): Promise<FetchedChapterList> {
  const html = await fetchHtml(bookUrl);
  const adapter = resolveAdapter(bookUrl);
  let chapters = adapter
    ? adapter.getChapterList(html, bookUrl)
    : extractChapterList(html, bookUrl);

  if (chapters.length === 0 && !adapter) {
    // The given URL had no chapter list -- follow the first same-origin
    // link that looks like a table of contents and try again there
    // (one hop only, to avoid loops).
    const tocUrl = findTocLink(html, bookUrl);
    if (tocUrl) {
      const tocHtml = await fetchHtml(tocUrl);
      const tocChapters = extractChapterList(tocHtml, tocUrl);
      if (tocChapters.length > 0) {
        chapters = tocChapters;
      }
    }
  }

  if (chapters.length === 0) {
    throw new Error(
      "Could not find a chapter list on this page (including one hop to a " +
        "likely table-of-contents link). The generic extractor is heuristic " +
        "-- this site's structure may need a dedicated adapter."
    );
  }

  // Metadata (description/cover/author) always comes from the originally
  // requested landing page, not a followed table-of-contents hop -- a
  // TOC page is typically just a chapter list, while the landing page is
  // where a site puts its og:description/og:image/meta[author] tags.
  return {
    bookTitle: extractPageTitle(html),
    description: extractDescription(html),
    coverImageUrl: extractCoverImageUrl(html),
    author: extractAuthor(html),
    chapters,
  };
}

export interface FetchedChapterContent {
  title: string | null;
  rawText: string;
}

export async function fetchChapterContent(chapterUrl: string): Promise<FetchedChapterContent> {
  const html = await fetchHtml(chapterUrl);
  const adapter = resolveAdapter(chapterUrl);
  const extracted = adapter
    ? adapter.getChapterContent(html, chapterUrl)
    : extractChapterContent(html);

  const rawText = filterBlacklist(extracted.text);
  if (!rawText.trim()) {
    throw new Error(
      "Could not extract chapter content from this page. The generic " +
        "extractor is unvalidated against real sites (see docs/ARCHITECTURE.md)."
    );
  }
  return { title: extracted.title, rawText };
}
