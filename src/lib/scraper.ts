// Top-level scraping entry points used by the API routes: fetch a page,
// dispatch to a per-site adapter if one matches (none exist yet), or the
// generic extractor otherwise. See docs/ARCHITECTURE.md "Scraping
// strategy" and "Scrape timing: lazy, on first view".
import * as cheerio from "cheerio";
import { extractChapterList } from "./extract/chapterList.ts";
import { extractChapterContent } from "./extract/chapterContent.ts";
import { resolveSite } from "./sites/registry.ts";
import { filterBlacklist } from "./blacklist.ts";
import { stripDangerousMarkup } from "./sanitizeText.ts";
import { looksLikeBotChallenge } from "./botChallenge.ts";
import { HeadlessBrowserRequiredError } from "./fetchErrors.ts";
import type { ChapterListItem } from "./extract/types";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

// A hung third-party source (no timeout at all previously) would otherwise
// stall the whole request -- vercel.json's maxDuration is 60s, so this
// leaves real headroom for parsing/DB work after the fetch resolves either
// way. The headless-browser fallback (browserFetch.ts) already has its own
// 30s timeout on page.goto; this covers the far more common plain-fetch path.
const FETCH_TIMEOUT_MS = 20_000;

// Re-exported so existing callers (e.g. src/app/api/surf/route.ts) can
// import it alongside fetchChapterContent without a second import line.
export { HeadlessBrowserRequiredError };

interface FetchHtmlOptions {
  /**
   * Whether a bot-challenged fetch may escalate to a real headless
   * browser launch. Defaults to true (every existing embedded-book flow:
   * add-by-URL, lazy chapter scrape, admin re-fetch). Callers that accept
   * an arbitrary, reader-submitted URL at request time (currently
   * /api/surf) pass `false` for an anonymous request instead -- see the
   * planning doc's section 5: an anonymous visitor hitting a bot-challenged
   * page gets a clear error instead of silently paying for a Chromium
   * launch on every request.
   */
  allowHeadless?: boolean;
}

// Falls back to a real headless browser (see src/lib/browserFetch.ts) when
// the plain fetch looks like a bot challenge -- e.g. book.sfacg.com works
// fine plain, but a Cloudflare-protected site like 69shuba.com would
// otherwise fail to ever be embeddable as a library book at all (Browse
// mode already had this fallback; the add-a-book/re-scrape pipeline
// didn't). A genuine non-challenge failure (404 etc.) still throws its own
// descriptive error instead of silently trying a browser for no reason.
async function fetchHtml(url: string, { allowHeadless = true }: FetchHtmlOptions = {}): Promise<string> {
  const html = await fetchHtmlRaw(url, allowHeadless);
  // Applied here, centrally, rather than in each of this file's callers
  // (fetchChapterList/fetchBookMeta/fetchChapterContent) or in Browse
  // mode's htmlProxy.ts separately -- every consumer of a fetched page's
  // HTML gets a site's raw-HTML preprocessing (e.g. sites/fanqie.ts's
  // font-deobfuscation) applied exactly once, right after the fetch,
  // before any extraction/rendering happens downstream.
  const site = resolveSite(url);
  return site?.preprocessHtml ? site.preprocessHtml(html, url) : html;
}

async function fetchHtmlRaw(url: string, allowHeadless: boolean): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const html = await res.text();
  if (looksLikeBotChallenge(res.status, html)) {
    if (!allowHeadless) {
      throw new HeadlessBrowserRequiredError(
        "Trang này cần chế độ trình duyệt đầy đủ để tải -- cần đăng nhập để dùng chế độ này."
      );
    }
    // Dynamic import: browserFetch.ts pulls in playwright-core, a heavy
    // dependency that should only ever load for the rare request that's
    // actually bot-challenged -- keeping it out of this module's static
    // import graph means every other page that transitively imports
    // scraper.ts (nearly all of them, via src/lib/novels.ts) never touches
    // playwright-core at all.
    const { fetchWithHeadlessBrowser } = await import("./browserFetch.ts");
    return fetchWithHeadlessBrowser(url);
  }
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  return html;
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

interface BookMetaResult {
  title: string | null;
  description: string | null;
  coverImageUrl: string | null;
  author: string | null;
}

// Metadata always comes from the originally requested landing page --
// where a site puts its og:description/og:image/meta[author] tags --
// unless the site overrides this (see SiteDefinition.getBookMeta's doc
// comment: some sites' meta tags are generic SEO boilerplate, not the
// book's actual title/synopsis).
function deriveBookMeta(
  html: string,
  bookUrl: string,
  site: ReturnType<typeof resolveSite>
): BookMetaResult {
  return (
    site?.getBookMeta?.(html, bookUrl) ?? {
      title: extractPageTitle(html),
      description: extractDescription(html),
      coverImageUrl: extractCoverImageUrl(html),
      author: extractAuthor(html),
    }
  );
}

// Book-level metadata only, no chapter list required -- used by the admin
// "refresh metadata" action (src/app/api/novels/[slug]/refetch-metadata/route.ts),
// which needs to re-derive title/description/author/cover without also
// re-deriving (and risking a mismatch against) the already-stored chapter
// list.
export async function fetchBookMeta(bookUrl: string): Promise<BookMetaResult> {
  const html = await fetchHtml(bookUrl);
  return deriveBookMeta(html, bookUrl, resolveSite(bookUrl));
}

export async function fetchChapterList(bookUrl: string): Promise<FetchedChapterList> {
  const html = await fetchHtml(bookUrl);
  const site = resolveSite(bookUrl);
  const extract = (h: string, u: string) =>
    site ? site.getChapterList(h, u) : extractChapterList(h, u);
  let chapters = extract(html, bookUrl);

  if (chapters.length === 0) {
    // The given URL had no chapter list -- follow the first same-origin
    // link that looks like a table of contents and try again there (one
    // hop only, to avoid loops). Applies even when an adapter matched:
    // an adapter can itself report "no chapter list here" (e.g.
    // book.sfacg.com's landing page vs. its separate MainIndex TOC
    // page) and still want its own extraction logic used on the page
    // the hop lands on.
    const tocUrl = findTocLink(html, bookUrl);
    if (tocUrl) {
      const tocHtml = await fetchHtml(tocUrl);
      const tocChapters = extract(tocHtml, tocUrl);
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
  // requested landing page, not a followed table-of-contents hop -- a TOC
  // page is typically just a chapter list.
  const meta = deriveBookMeta(html, bookUrl, site);
  return {
    bookTitle: meta.title,
    description: meta.description,
    coverImageUrl: meta.coverImageUrl,
    author: meta.author,
    chapters,
  };
}

// Diffs a freshly-fetched chapter list against what's already stored for a
// novel (see src/app/api/novels/[slug]/refetch-chapters/route.ts, the admin
// "check for new chapters" action) -- there's no other update mechanism,
// see docs/ARCHITECTURE.md "Scrape timing": a book's chapter list is
// otherwise fetched exactly once, at add time. Matches by sourceUrl, not
// position, so it stays correct even if the site prepends a volume/foreword
// entry above chapter 1. Assumes a site only appends chapters over time
// (true for ongoing web novels) -- a site that reorders or renumbers its
// entire existing list isn't handled and would need a full re-embed.
export function selectNewChapters(
  existingSourceUrls: ReadonlySet<string>,
  fetchedChapters: ChapterListItem[]
): ChapterListItem[] {
  return fetchedChapters.filter((c) => !existingSourceUrls.has(c.url));
}

export interface FetchedChapterContent {
  title: string | null;
  rawText: string;
}

export async function fetchChapterContent(
  chapterUrl: string,
  options?: FetchHtmlOptions
): Promise<FetchedChapterContent> {
  const html = await fetchHtml(chapterUrl, options);
  const site = resolveSite(chapterUrl);
  const extracted = site
    ? await site.getChapterContent(html, chapterUrl)
    : extractChapterContent(html);

  const rawText = filterBlacklist(stripDangerousMarkup(extracted.text));
  if (!rawText.trim()) {
    throw new Error(
      "Could not extract chapter content from this page. The generic " +
        "extractor is unvalidated against real sites (see docs/ARCHITECTURE.md)."
    );
  }
  return { title: extracted.title, rawText };
}
