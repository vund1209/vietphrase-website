// Per-site adapter registry, tried before the generic extractor. Per
// docs/ARCHITECTURE.md "Scraping strategy": add one here only once a
// real target site is confirmed and the generic extractor
// (chapterList.ts / chapterContent.ts) demonstrably fails on it.
import * as cheerio from "cheerio";
import { extractChapterContent } from "./chapterContent.ts";
import type { BookMeta, ChapterListItem, SiteAdapter } from "./types";

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

const sfacgAdapter: SiteAdapter = {
  name: "book.sfacg.com",
  matches: sfacgMatches,
  getChapterList: sfacgGetChapterList,
  getChapterContent: (html) => extractChapterContent(html),
  getBookMeta: sfacgGetBookMeta,
};

const ADAPTERS: SiteAdapter[] = [sfacgAdapter];

export function resolveAdapter(url: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}
