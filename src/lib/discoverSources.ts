// Curated registry of known source sites for Discover mode
// (src/app/surf/discover) -- pairs a display entry with the SiteAdapter
// (src/lib/extract/adapters.ts) that actually knows how to read that
// site's book-list pages via getBookList. Deliberately small and
// hand-maintained, not derived automatically from the adapters list,
// since a future adapter might exist only for the embed pipeline
// (chapter-list/content extraction) without a Discover-mode entry.
//
// book.sfacg.com/List/ was inspected directly (DOM structure and its own
// nav links, not guessed) to build this: it only actually exposes two
// navigable list views -- the full list ("全部小说列表", /List/) and a
// weekly-updated list ("一周更新列表", /List/?ud=7). No genre-filter or
// month/newest/rankings sub-tabs exist on the real page, so this only
// models what's actually there. Pagination beyond page 1 is a separate
// `PageIndex` query param on `/List/default.aspx`.
export type DiscoverSort = "all" | "weekly";

export interface DiscoverSource {
  id: string;
  displayName: string;
  hostname: string;
  /** Builds an absolute URL for a page (1-based) of this source's book list. */
  buildListUrl(page: number, sort: DiscoverSort): string;
}

const SFACG_SOURCE: DiscoverSource = {
  id: "sfacg",
  displayName: "SF轻小说 (sfacg.com)",
  hostname: "book.sfacg.com",
  buildListUrl(page, sort) {
    const params = new URLSearchParams();
    if (sort === "weekly") params.set("ud", "7");
    if (page > 1) {
      params.set("PageIndex", String(page));
      return `https://book.sfacg.com/List/default.aspx?${params.toString()}`;
    }
    const qs = params.toString();
    return `https://book.sfacg.com/List/${qs ? `?${qs}` : ""}`;
  },
};

// 69shuba.com/novels/hot (rankings): confirmed live to render 50 books
// per page in the initial HTML. No confirmed pagination pattern this
// session (two guessed URL shapes both 404'd, not shipping a guess) and
// no confirmed sort variant beyond this one rankings view -- `page`/
// `sort` are accepted for interface consistency but currently both
// resolve to this same single URL, a known rough edge rather than a
// silently-wrong guess.
const SHUBA_SOURCE: DiscoverSource = {
  id: "69shuba",
  displayName: "69书吧 (69shuba.com)",
  hostname: "www.69shuba.com",
  buildListUrl() {
    return "https://www.69shuba.com/novels/hot";
  },
};

export const DISCOVER_SOURCES: DiscoverSource[] = [SFACG_SOURCE, SHUBA_SOURCE];

export function getDiscoverSource(id: string): DiscoverSource | null {
  return DISCOVER_SOURCES.find((s) => s.id === id) ?? null;
}
