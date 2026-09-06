// book.sfacg.com -- see docs/ADDING_A_SITE.md for the general contract
// this file implements (SiteDefinition, src/lib/sites/types.ts).
import * as cheerio from "cheerio";
import { extractChapterContent } from "../extract/chapterContent.ts";
import type { BookMeta, ChapterListItem, DiscoverBookListItem } from "../extract/types";
import type { SiteDefinition } from "./types";

function sfacgMatches(url: string): boolean {
  try {
    return new URL(url).hostname === "book.sfacg.com";
  } catch {
    return false;
  }
}

// The generic extractor's link-clustering heuristics (extract/chapterList.ts)
// repeatedly false-positive-matched this site's landing-page chrome
// closely enough to look like a real chapter list -- footer utility links
// (contact/ToS/ICP filing), a same-origin "recommended books" widget, and
// a genre-nav sidebar each scored as a plausible cluster in turn as the
// prior false match was patched around. Even past the landing page, the
// real TOC (at /Novel/<id>/MainIndex/, reached via the existing
// findTocLink two-hop in scraper.ts) splits chapters across one
// <div class="story-catalog"> per volume, so taking only the single
// densest cluster (the generic extractor's approach) silently drops
// every volume but one.
const SFACG_CHAPTER_LIST_SELECTOR = ".story-catalog .catalog-list a[href]";

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
// site): each entry is its own <ul class="Comic_Pic_List"> containing a
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

// book.sfacg.com/List/'s own nav links were inspected directly to build
// this: it only actually exposes two navigable list views -- the full
// list ("全部小说列表", /List/) and a weekly-updated list ("一周更新列表",
// /List/?ud=7). No genre-filter or month/newest/rankings sub-tabs exist
// on the real page, so this only models what's actually there.
// Pagination beyond page 1 is a separate `PageIndex` query param on
// `/List/default.aspx`.
function sfacgBuildListUrl(page: number, sort: "all" | "weekly"): string {
  const params = new URLSearchParams();
  if (sort === "weekly") params.set("ud", "7");
  if (page > 1) {
    params.set("PageIndex", String(page));
    return `https://book.sfacg.com/List/default.aspx?${params.toString()}`;
  }
  const qs = params.toString();
  return `https://book.sfacg.com/List/${qs ? `?${qs}` : ""}`;
}

export const sfacgSite: SiteDefinition = {
  id: "sfacg",
  displayName: "SF轻小说 (sfacg.com)",
  matches: sfacgMatches,
  getChapterList: sfacgGetChapterList,
  getChapterContent: async (html) => extractChapterContent(html),
  getBookMeta: sfacgGetBookMeta,
  discover: {
    hostname: "book.sfacg.com",
    buildListUrl: sfacgBuildListUrl,
    getBookList: sfacgGetBookList,
  },
};
