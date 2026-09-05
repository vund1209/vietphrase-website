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
}
