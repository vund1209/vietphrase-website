// fanqienovel.com (Fanqie Novel / ByteDance) -- see docs/ADDING_A_SITE.md
// for the general contract this file implements (SiteDefinition,
// src/lib/sites/types.ts). Confirmed reachable via a plain fetch (no
// bot-challenge), unlike the Cloudflare-protected sites this app already
// handles via the headless-browser fallback.
import * as cheerio from "cheerio";
import { extractChapterContent } from "../extract/chapterContent.ts";
import { extractChapterList } from "../extract/chapterList.ts";
import { deobfuscateFanqieText } from "./fanqieFontDecode.ts";
import type { BookMeta, ExtractedChapterContent } from "../extract/types";
import type { SiteDefinition } from "./types";

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
// (extract/chapterList.ts) already handles this correctly on a real
// 351-chapter page, see extract/chapterList.test.ts's fanqienovel
// fixture. No getChapterList override needed here as a result.

// Chapter pages carry TWO literal <h1> elements in DOM order:
// h1.muye-reader-nav-title (the *book* title, with an inlined
// back-arrow icon) comes first, then h1.muye-reader-title (the real
// chapter title) -- confirmed directly on a live chapter page. The
// generic extractor's extractTitle() takes the first h1 unconditionally,
// so it would return the book title on every single chapter here. Body
// text itself (.muye-reader-content, clean <p>-per-paragraph) already
// extracts correctly via the generic CJK-density pass, so only title
// resolution needs overriding. Font-obfuscation (see fanqieFontDecode.ts)
// is already reversed by the time this runs -- fanqieSite.preprocessHtml
// deobfuscates the raw HTML before this or any other extraction sees it.
async function fanqieGetChapterContent(html: string): Promise<ExtractedChapterContent> {
  const generic = extractChapterContent(html);
  const $ = cheerio.load(html);
  const chapterTitle = $(".muye-reader-title").first().text().trim();
  return { title: chapterTitle || generic.title, text: generic.text };
}

// Reverses this site's font-obfuscation anti-scraping scheme (see
// fanqieFontDecode.ts's doc comment) on the RAW HTML string, before any
// extraction (getChapterList/getChapterContent/getBookMeta) *or* Browse
// mode's site-agnostic htmlProxy.ts ever sees it -- both consume this
// same preprocessed HTML via src/lib/scraper.ts's fetchHtml, which is
// the one place this hook is actually invoked (see SiteDefinition's own
// doc comment for why it isn't wired into each extractor individually).
// Passing `html` as both arguments substitutes PUA characters wherever
// they appear in the raw markup; the actual substituted characters are
// literal Unicode text in this site's HTML, not HTML entities, so a
// direct string scan is correct without parsing first.
async function fanqiePreprocessHtml(html: string): Promise<string> {
  return deobfuscateFanqieText(html, html);
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
// same defensive pattern sites/sfacg.ts's getBookMeta already uses.
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

export const fanqieSite: SiteDefinition = {
  id: "fanqie",
  displayName: "番茄小说 (fanqienovel.com)",
  matches: fanqieMatches,
  getChapterList: (html, pageUrl) => extractChapterList(html, pageUrl),
  getChapterContent: fanqieGetChapterContent,
  getBookMeta: fanqieGetBookMeta,
  preprocessHtml: fanqiePreprocessHtml,
  // No `discover`: the real browse/rank list loads via internal JSON
  // endpoints gated behind a msToken/a_bogus signed-request scheme
  // (ByteDance's own anti-automation token, visible in the network log
  // on a live /library page) -- not a bot-*challenge* fetchHtml would
  // ever detect/escalate for, just a dynamic endpoint with no legitimate
  // way for this app to generate a valid token. Not reverse-engineering
  // it (fragile, rotates) -- this site just isn't offered in Discover
  // mode, same as any SiteDefinition that omits this optional field.
};
