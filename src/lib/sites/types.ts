// A supported Chinese novel site is one file under src/lib/sites/
// exporting a single SiteDefinition -- see docs/ADDING_A_SITE.md for the
// contributor-facing walkthrough. This merges what used to be two
// separately-maintained registries (src/lib/extract/adapters.ts's
// per-site scraping overrides, src/lib/discoverSources.ts's Discover-mode
// list-page config) into one object per site, so "does this site support
// Discover mode" is a single optional field instead of two files that
// could silently drift out of sync.
import type { BookMeta, ChapterListItem, ExtractedChapterContent, DiscoverBookListItem } from "../extract/types.ts";

export type DiscoverSort = "all" | "weekly";

export interface SiteDefinition {
  /** Stable slug, e.g. "sfacg" -- appears in /surf/discover/[source] URLs. */
  id: string;
  /** e.g. "SF轻小说 (sfacg.com)" -- shown in Discover mode's source picker. */
  displayName: string;
  /** Does this URL belong to this site (any page: book landing, chapter, list)? */
  matches(url: string): boolean;
  getChapterList(html: string, pageUrl: string): ChapterListItem[];
  /**
   * Async for interface consistency with `preprocessHtml` below (a site
   * that needs one often needs the other) -- sfacg.ts/shuba.ts just wrap
   * their synchronous body in an `async` function.
   */
  getChapterContent(html: string, pageUrl: string): Promise<ExtractedChapterContent>;
  /**
   * Optional: overrides the generic extractor's og:.../meta[name=...]
   * metadata extraction for a site whose real title/synopsis/author/cover
   * live in the page's own markup instead (e.g. book.sfacg.com puts a
   * generic SEO blurb in meta[name=description] and the real synopsis in
   * a `p.introduce` element instead). Absent = fall back to the generic
   * extractor entirely.
   */
  getBookMeta?(html: string, pageUrl: string): BookMeta;
  /**
   * Optional: transforms a freshly-fetched page's raw HTML before ANY
   * further processing -- extraction (getChapterList/getChapterContent/
   * getBookMeta) *and* Browse mode's htmlProxy.ts, which has no other
   * hook into per-site knowledge at all. Applied centrally in
   * src/lib/scraper.ts's fetchHtml, once, right after the fetch, so
   * every consumer benefits without each needing its own integration.
   * Currently used by sites/fanqie.ts alone, to reverse a font-
   * obfuscation anti-scraping scheme (real Chinese characters replaced
   * with Private-Use-Area codepoints, paired with a custom @font-face
   * that only renders correctly in a real browser) -- see
   * sites/fanqieFontDecode.ts's doc comment for the full mechanism.
   */
  preprocessHtml?(html: string, pageUrl: string): Promise<string>;
  /**
   * Present only for a site with a parseable public browse/rank list --
   * powers Discover mode (src/app/surf/discover). Absent = this site
   * isn't offered there, even if it has full chapter-list/content support
   * for the embed pipeline (e.g. fanqienovel.com: its real browse list
   * loads via a signed-token-gated endpoint this app has no legitimate
   * way to call, see sites/fanqie.ts).
   */
  discover?: {
    hostname: string;
    /** Builds an absolute URL for a page (1-based) of this site's book list. */
    buildListUrl(page: number, sort: DiscoverSort): string;
    getBookList(html: string, pageUrl: string): DiscoverBookListItem[];
  };
}
