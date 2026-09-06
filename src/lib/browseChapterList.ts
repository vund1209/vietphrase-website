// Best-effort chapter list for Browse mode's "Bắt đầu đọc" panel (see
// src/app/surf/browse/page.tsx). Browsing a book's own landing/detail
// page via Browse mode previously left the reader to find that site's
// own "start reading" link buried in its proxied markup -- easy to miss
// entirely on some sites (confirmed directly: book.sfacg.com's own link
// is a small text link lost among a dozen other small nav links, not
// something that reads as a button). Reusing the adapter/generic-
// extractor chapter-list logic already built for the embed pipeline
// gives Browse mode the same reliable, prominent CTA every embedded
// novel already gets via NovelProgressSection, for any source an
// adapter (or the generic extractor) can already parse.
//
// Deliberately cheaper than scraper.ts's fetchChapterList: that helper
// always re-fetches the given URL itself before extracting, which would
// double the network cost of every single Browse-mode pageview (and, for
// a Cloudflare-gated source, a second real headless-browser launch).
// This instead reuses the HTML the page already fetched for the proxied
// view, only paying for one additional fetch -- the same-origin
// table-of-contents hop many sites split their landing page from, via
// scraper.ts's own findTocLink -- when that free attempt comes up empty.
import { extractChapterList } from "./extract/chapterList.ts";
import { resolveAdapter } from "./extract/adapters.ts";
import { findTocLink } from "./scraper.ts";
import { fetchRawHtml } from "./browserFetch.ts";
import type { ChapterListItem } from "./extract/types";

export async function tryGetBrowseChapterList(
  rawHtml: string,
  url: string,
  allowHeadless: boolean
): Promise<ChapterListItem[]> {
  try {
    const adapter = resolveAdapter(url);
    const extract = (h: string, u: string): ChapterListItem[] =>
      adapter ? adapter.getChapterList(h, u) : extractChapterList(h, u);

    const direct = extract(rawHtml, url);
    if (direct.length > 0) return direct;

    const tocUrl = findTocLink(rawHtml, url);
    if (!tocUrl) return [];
    const tocHtml = await fetchRawHtml(tocUrl, { allowHeadless });
    return extract(tocHtml, tocUrl);
  } catch {
    // A missing chapter list here just means the panel doesn't render --
    // Browse mode's own proxied view already succeeded by the time this
    // runs, and that's the page's actual primary content.
    return [];
  }
}
