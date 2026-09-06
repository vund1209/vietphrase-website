// Shared data shapes produced by extraction -- used by both the generic,
// site-agnostic extractors in this directory (chapterList.ts,
// chapterContent.ts) and every per-site SiteDefinition under
// src/lib/sites/ (see that directory's types.ts for the adapter
// interface itself, and docs/ARCHITECTURE.md "Scraping strategy" for the
// overall design).

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
  /** Raw, untranslated short synopsis shown on the list page itself, if the source's own list view includes one (not every source does -- e.g. book.sfacg.com's list rows carry no blurb at all). */
  description: string | null;
  author: string | null;
  coverImageUrl: string | null;
  /** The book's own landing/detail page on the source site -- what an embed action passes to POST /api/novels. */
  url: string;
}

