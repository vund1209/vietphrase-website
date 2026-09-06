// Per-site adapter registry, tried before the generic extractor. Per
// docs/ARCHITECTURE.md "Scraping strategy": add one here only once a
// real target site is confirmed and the generic extractor
// (chapterList.ts / chapterContent.ts) demonstrably fails on it.
import * as cheerio from "cheerio";
import { extractChapterContent } from "./chapterContent.ts";
import { extractChapterList } from "./chapterList.ts";
import type { BookMeta, ChapterListItem, DiscoverBookListItem, ExtractedChapterContent, SiteAdapter } from "./types";

// book.sfacg.com: the generic extractor's link-clustering heuristics
// (chapterList.ts) repeatedly false-positive-matched this site's
// landing-page chrome closely enough to look like a real chapter list
// -- footer utility links (contact/ToS/ICP filing), a same-origin
// "recommended books" widget, and a genre-nav sidebar each scored as a
// plausible cluster in turn as the prior false match was patched
// around. Even past the landing page, the real TOC (at
// /Novel/<id>/MainIndex/, reached via the existing findTocLink two-hop
// in scraper.ts) splits chapters across one <div class="story-catalog">
// per volume, so taking only the single densest cluster (chapterList.ts's
// approach) silently drops every volume but one.
const SFACG_CHAPTER_LIST_SELECTOR = ".story-catalog .catalog-list a[href]";

function sfacgMatches(url: string): boolean {
  try {
    return new URL(url).hostname === "book.sfacg.com";
  } catch {
    return false;
  }
}

// Returns [] on the landing page (no .story-catalog there at all), which
// is what lets scraper.ts's existing two-hop TOC-follow fire and land on
// the real MainIndex TOC page.
function sfacgGetChapterList(html: string, pageUrl: string): ChapterListItem[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: ChapterListItem[] = [];

  $(SFACG_CHAPTER_LIST_SELECTOR).each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (!href) return;
    const title = ($el.attr("title") || $el.text()).trim();
    if (!title) return;

    let resolved: string;
    try {
      resolved = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    if (seen.has(resolved)) return;
    seen.add(resolved);
    items.push({ title, url: resolved });
  });

  return items;
}

// book.sfacg.com's meta[name=description] is a generic SEO blurb (site
// name + "online reading of <title>"), not the book's actual synopsis --
// that lives in the landing page's own markup instead, alongside the
// real title (its <title> tag also carries SEO suffixes the way the
// meta description does) and author. Confirmed by fetching a real
// landing page and inspecting its DOM directly.
function sfacgGetBookMeta(html: string, pageUrl: string): BookMeta {
  const $ = cheerio.load(html);
  const summary = $(".summary-content").first();

  const titleEl = summary.find("h1.title .text").first().clone();
  titleEl.find(".tag").remove();
  const title = titleEl.text().trim() || null;

  const description = summary.find("p.introduce").first().text().trim() || null;
  const author = summary.find(".author-name span").first().text().trim() || null;
  const coverSrc = summary.parent().find(".summary-pic img").first().attr("src")?.trim();
  let coverImageUrl: string | null = null;
  if (coverSrc) {
    try {
      coverImageUrl = new URL(coverSrc, pageUrl).toString();
    } catch {
      coverImageUrl = null;
    }
  }

  return { title, description, author, coverImageUrl };
}

// book.sfacg.com/List/'s book-list page (Discover mode's source for this
// adapter): each entry is its own <ul class="Comic_Pic_List"> containing a
// cover-image <li> and a text <li> (title/author/genre-tag/synopsis) --
// confirmed by inspecting the live list page's DOM directly, same approach
// as sfacgGetBookMeta above. Scoped under .comic_cover (the page's one real
// list container) so this can't accidentally pick up an unrelated widget
// reusing the same list-item class elsewhere on the page.
const SFACG_BOOK_LIST_ITEM_SELECTOR = ".comic_cover ul.Comic_Pic_List";

function sfacgGetBookList(html: string, pageUrl: string): DiscoverBookListItem[] {
  const $ = cheerio.load(html);
  const items: DiscoverBookListItem[] = [];
  const seen = new Set<string>();

  $(SFACG_BOOK_LIST_ITEM_SELECTOR).each((_, el) => {
    const $el = $(el);
    const titleLink = $el.find("li strong a[href*='/Novel/']").first();
    const href = titleLink.attr("href");
    const title = titleLink.text().trim();
    if (!href || !title) return;

    let url: string;
    try {
      url = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);

    const author = $el.find("li a[href*='/Club/']").first().text().trim() || null;
    const coverSrc = $el.find("li.Conjunction img").first().attr("src")?.trim();
    let coverImageUrl: string | null = null;
    if (coverSrc) {
      try {
        coverImageUrl = new URL(coverSrc, pageUrl).toString();
      } catch {
        coverImageUrl = null;
      }
    }

    // book.sfacg.com's own list rows carry no synopsis/blurb at all
    // (confirmed directly against the live list page's DOM) -- only
    // title/author/cover/status/category, unlike 69shuba.com's list rows.
    items.push({ title, description: null, author, coverImageUrl, url });
  });

  return items;
}

const sfacgAdapter: SiteAdapter = {
  name: "book.sfacg.com",
  matches: sfacgMatches,
  getChapterList: sfacgGetChapterList,
  getChapterContent: (html) => extractChapterContent(html),
  getBookMeta: sfacgGetBookMeta,
  getBookList: sfacgGetBookList,
};

// fanqienovel.com (Fanqie Novel / ByteDance): confirmed reachable via a
// plain fetch (no bot-challenge), unlike the Cloudflare-protected sites
// this app already handles via the headless-browser fallback.
function fanqieMatches(url: string): boolean {
  try {
    return new URL(url).hostname === "fanqienovel.com";
  } catch {
    return false;
  }
}

// The book-landing page (/page/<id>) already IS the chapter list (a
// single dense div.chapter > div.chapter-item > a.chapter-item-title
// cluster, no two-hop needed) -- confirmed the generic extractor
// (chapterList.ts) already handles this correctly on a real 351-chapter
// page, see chapterList.test.ts's fanqienovel fixture. No getChapterList
// override here as a result.

// Chapter pages carry TWO literal <h1> elements in DOM order:
// h1.muye-reader-nav-title (the *book* title, with an inlined
// back-arrow icon) comes first, then h1.muye-reader-title (the real
// chapter title) -- confirmed directly on a live chapter page. The
// generic extractor's extractTitle() takes the first h1 unconditionally,
// so it would return the book title on every single chapter here. Body
// text itself (.muye-reader-content, clean <p>-per-paragraph) already
// extracts correctly via the generic CJK-density pass, so only title
// resolution needs overriding.
function fanqieGetChapterContent(html: string): ExtractedChapterContent {
  const generic = extractChapterContent(html);
  const $ = cheerio.load(html);
  const chapterTitle = $(".muye-reader-title").first().text().trim();
  return { title: chapterTitle || generic.title, text: generic.text };
}

// No og:title/og:image/meta[name=author] exist on this site at all
// (confirmed: zero meta[property^="og:"] tags on a real landing page).
// title: the landing page's own plain, unclassed <h1> (not the
// nav-title one -- that only exists on chapter pages, not here).
// description: .page-abstract-content (the <title> tag and any generic
// meta description both carry an SEO suffix, this element doesn't).
// author: .author-name-text. cover: img.book-cover-img's src -- resolve
// via new URL(src, pageUrl) regardless of whether it's absolute or
// protocol-relative (observed both forms across different real pages),
// same defensive pattern sfacgGetBookMeta already uses.
function fanqieGetBookMeta(html: string, pageUrl: string): BookMeta {
  const $ = cheerio.load(html);

  const title = $("h1").first().text().trim() || null;
  const description = $(".page-abstract-content").first().text().trim() || null;
  const author = $(".author-name-text").first().text().trim() || null;
  const coverSrc = $("img.book-cover-img").first().attr("src")?.trim();
  let coverImageUrl: string | null = null;
  if (coverSrc) {
    try {
      coverImageUrl = new URL(coverSrc, pageUrl).toString();
    } catch {
      coverImageUrl = null;
    }
  }

  return { title, description, author, coverImageUrl };
}

const fanqieAdapter: SiteAdapter = {
  name: "fanqienovel.com",
  matches: fanqieMatches,
  getChapterList: (html, pageUrl) => extractChapterList(html, pageUrl),
  getChapterContent: fanqieGetChapterContent,
  getBookMeta: fanqieGetBookMeta,
  // No getBookList: the real browse/rank list loads via internal JSON
  // endpoints gated behind a msToken/a_bogus signed-request scheme
  // (ByteDance's own anti-automation token, visible in the network log
  // on a live /library page) -- not a bot-*challenge* fetchHtml would
  // ever detect/escalate for, just a dynamic endpoint with no legitimate
  // way for this app to generate a valid token. Not reverse-engineering
  // it (fragile, rotates) -- this source just isn't offered in Discover
  // mode, same as any adapter that omits this optional method.
};

// 69shuba.com: Cloudflare-protected (blocked on a plain fetch, needs the
// existing headless-browser fallback in browserFetch.ts/scraper.ts's
// fetchHtml). getChapterContent is already correctly handled by the
// generic extractor (confirmed live: the <br>-separated, zero-<p>
// paragraph style is exactly what chapterContent.ts's extractParagraphs
// br-fallback already handles, including a correctly-resolved chapter
// <h1> -- no title bug here unlike fanqienovel).
//
// getChapterList needs a real override, though -- confirmed by an actual
// embed attempt landing on only 5 chapters instead of the real ~569.
// The landing page (/book/<id>.htm) itself carries a small "latest
// chapters" preview widget (exactly 5 links matching the chapter-label
// pattern) that the generic extractor's pass-1 heuristic happily accepts
// as a real chapter list, since it's non-empty -- which means
// scraper.ts's fetchChapterList never runs its `chapters.length === 0`
// check that would otherwise trigger findTocLink's two-hop follow to the
// real TOC page (/book/<id>/, linked via "开始阅读"/"完整目录"). Same
// class of problem sfacg's own adapter comment already describes for a
// different reason. Fix: force an empty result specifically on the
// `.htm`-suffixed landing page URL, so the two-hop always fires; the
// real TOC page (no `.htm` suffix) still uses the generic extractor,
// which handles its flat chapter list correctly.
function shubaMatches(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("69shuba.com");
  } catch {
    return false;
  }
}

function shubaGetChapterList(html: string, pageUrl: string): ChapterListItem[] {
  if (/\.htm$/.test(new URL(pageUrl).pathname)) return [];
  return extractChapterList(html, pageUrl);
}

// og:description embeds a literal escaped "<br />" artifact mid-text on
// this site (confirmed on a real landing page) -- a clean synopsis with
// real <br> elements lives in div.navtxt p instead, same <br>-to-newline
// technique chapterContent.ts's extractParagraphs already uses. title:
// landing page's own h1 a (its <title> tag carries the usual SEO
// suffix). author: the one link into the author-profile page --
// confirmed selector, not the generic meta[name=author] (absent here).
// og:image is fine generically as-is, so reused directly rather than
// re-deriving a second way.
function shubaGetBookMeta(html: string, pageUrl: string): BookMeta {
  const $ = cheerio.load(html);

  const title = $("h1 a").first().text().trim() || null;

  const descContainer = $("div.navtxt p").first().clone();
  descContainer.find("br").replaceWith("\n");
  const description =
    descContainer
      .text()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n") || null;

  const author = $('a[href*="/modules/article/author.php"]').first().text().trim() || null;

  const coverSrc = $('meta[property="og:image"]').attr("content")?.trim();
  let coverImageUrl: string | null = null;
  if (coverSrc) {
    try {
      coverImageUrl = new URL(coverSrc, pageUrl).toString();
    } catch {
      coverImageUrl = null;
    }
  }

  return { title, description, author, coverImageUrl };
}

// /novels/hot (rankings): 50 books per page in the initial HTML (no JS
// needed once past Cloudflare), scoped under one .newbox ul container --
// confirmed no stray .newnav elsewhere on the page (li count matches
// .newnav count exactly). author is the FIRST <label> in .labelbox --
// the second is serialization status ("连载"/"完结"), a real decoy this
// selector must not pick up. No confirmed pagination pattern for this
// page as of this session (two guessed URL shapes both 404'd) -- ships
// as a single page; buildListUrl in discoverSources.ts ignores `page`
// for this source as a result, a known rough edge, not silently wrong.
const SHUBA_BOOK_LIST_SELECTOR = ".newbox ul li";

function shubaGetBookList(html: string, pageUrl: string): DiscoverBookListItem[] {
  const $ = cheerio.load(html);
  const items: DiscoverBookListItem[] = [];
  const seen = new Set<string>();

  $(SHUBA_BOOK_LIST_SELECTOR).each((_, el) => {
    const $el = $(el);
    const titleLink = $el.find(".newnav h3 a").first();
    const href = titleLink.attr("href");
    const title = titleLink.text().trim();
    if (!href || !title) return;

    let url: string;
    try {
      url = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);

    const author = $el.find(".labelbox label").first().text().trim() || null;
    const coverImg = $el.find("a.imgbox img").first();
    const coverSrc = (coverImg.attr("src") || coverImg.attr("data-src"))?.trim();
    let coverImageUrl: string | null = null;
    if (coverSrc) {
      try {
        coverImageUrl = new URL(coverSrc, pageUrl).toString();
      } catch {
        coverImageUrl = null;
      }
    }
    // A short (~2-line-clamped, .ellipsis_2) synopsis blurb -- confirmed
    // directly on the live list page's DOM, oddly marked up as a plain
    // text node inside an <ol> with no nested elements at all.
    const description = $el.find(".ellipsis_2").first().text().trim() || null;

    items.push({ title, description, author, coverImageUrl, url });
  });

  return items;
}

const shubaAdapter: SiteAdapter = {
  name: "69shuba.com",
  matches: shubaMatches,
  getChapterList: shubaGetChapterList,
  getChapterContent: (html) => extractChapterContent(html),
  getBookMeta: shubaGetBookMeta,
  getBookList: shubaGetBookList,
};

const ADAPTERS: SiteAdapter[] = [sfacgAdapter, fanqieAdapter, shubaAdapter];

export function resolveAdapter(url: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}
