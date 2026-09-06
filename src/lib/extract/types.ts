// Shared types for chapter-list/chapter-content extraction. See
// docs/ARCHITECTURE.md "Scraping strategy: generic extraction, adapters
// as a fallback" for the design this implements.

export interface ChapterListItem {
  title: string;
  url: string;
}

export interface ExtractedChapterContent {
  title: string | null;
  text: string;
}

export interface BookMeta {
  title: string | null;
  description: string | null;
  author: string | null;
  coverImageUrl: string | null;
}

/** One entry in a source site's own browse/rankings list -- see getBookList below. */
export interface DiscoverBookListItem {
  title: string;
  author: string | null;
  coverImageUrl: string | null;
  /** The book's own landing/detail page on the source site -- what an embed action passes to POST /api/novels. */
  url: string;
}

/**
 * Per-site adapter interface, tried before the generic extractor. No
 * adapters exist yet -- add one here only once a real target site is
 * confirmed and the generic extractor demonstrably fails on it (see
 * docs/ARCHITECTURE.md).
 */
export interface SiteAdapter {
  name: string;
  matches(url: string): boolean;
  getChapterList(html: string, pageUrl: string): ChapterListItem[];
  getChapterContent(html: string, pageUrl: string): ExtractedChapterContent;
  /**
   * Optional: overrides scraper.ts's generic og:.../meta[name=...] extraction
   * for a site whose real title/synopsis/author/cover live in the page's
   * own markup rather than its link-preview meta tags (e.g. book.sfacg.com
   * puts a generic SEO blurb in meta[name=description] and the real
   * synopsis in a `p.introduce` element instead). Absent = fall back to
   * the generic extractor entirely.
   */
  getBookMeta?(html: string, pageUrl: string): BookMeta;
  /**
   * Optional: extracts a page of book-list entries from a source's own
   * browse/rankings list page (not a chapter list) -- powers Discover mode
   * (src/app/surf/discover). Absent = this source isn't offered there, even
   * if it has chapter-list/content adapters for the embed pipeline.
   */
  getBookList?(html: string, pageUrl: string): DiscoverBookListItem[];
}
