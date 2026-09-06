// 69shuba.com -- see docs/ADDING_A_SITE.md for the general contract this
// file implements (SiteDefinition, src/lib/sites/types.ts).
// Cloudflare-protected (blocked on a plain fetch, needs the existing
// headless-browser fallback in browserFetch.ts/scraper.ts's fetchHtml).
import * as cheerio from "cheerio";
import { extractChapterContent } from "../extract/chapterContent.ts";
import { extractChapterList } from "../extract/chapterList.ts";
import type { BookMeta, ChapterListItem, DiscoverBookListItem } from "../extract/types";
import type { SiteDefinition } from "./types";

function shubaMatches(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("69shuba.com");
  } catch {
    return false;
  }
}

// getChapterContent is already correctly handled by the generic extractor
// (confirmed live: the <br>-separated, zero-<p> paragraph style is
// exactly what extract/chapterContent.ts's extractParagraphs br-fallback
// already handles, including a correctly-resolved chapter <h1> -- no
// title bug here unlike fanqienovel.com).
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
// class of problem sites/sfacg.ts's own adapter comment already
// describes for a different reason. Fix: force an empty result
// specifically on the `.htm`-suffixed landing page URL, so the two-hop
// always fires; the real TOC page (no `.htm` suffix) still uses the
// generic extractor, which handles its flat chapter list correctly.
function shubaGetChapterList(html: string, pageUrl: string): ChapterListItem[] {
  if (/\.htm$/.test(new URL(pageUrl).pathname)) return [];
  return extractChapterList(html, pageUrl);
}

// og:description embeds a literal escaped "<br />" artifact mid-text on
// this site (confirmed on a real landing page) -- a clean synopsis with
// real <br> elements lives in div.navtxt p instead, same <br>-to-newline
// technique extract/chapterContent.ts's extractParagraphs already uses.
// title: landing page's own h1 a (its <title> tag carries the usual SEO
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
// as a single page; buildListUrl below ignores `page` for this site as
// a result, a known rough edge, not silently wrong.
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

// 69shuba.com/novels/hot (rankings): confirmed live to render 50 books
// per page in the initial HTML. No confirmed pagination pattern this
// session (two guessed URL shapes both 404'd, not shipping a guess) and
// no confirmed sort variant beyond this one rankings view -- `page`/
// `sort` are accepted for interface consistency but currently both
// resolve to this same single URL, a known rough edge rather than a
// silently-wrong guess.
function shubaBuildListUrl(): string {
  return "https://www.69shuba.com/novels/hot";
}

export const shubaSite: SiteDefinition = {
  id: "69shuba",
  displayName: "69书吧 (69shuba.com)",
  matches: shubaMatches,
  getChapterList: shubaGetChapterList,
  getChapterContent: async (html) => extractChapterContent(html),
  getBookMeta: shubaGetBookMeta,
  discover: {
    hostname: "www.69shuba.com",
    buildListUrl: shubaBuildListUrl,
    getBookList: shubaGetBookList,
  },
};
