// Top-level scraping entry points used by the API routes: fetch a page,
// dispatch to a per-site adapter if one matches (none exist yet), or the
// generic extractor otherwise. See docs/ARCHITECTURE.md "Scraping
// strategy" and "Scrape timing: lazy, on first view".
import { extractChapterList } from "./extract/chapterList.ts";
import { extractChapterContent } from "./extract/chapterContent.ts";
import { resolveAdapter } from "./extract/adapters.ts";
import { filterBlacklist } from "./blacklist.ts";
import type { ChapterListItem } from "./extract/types";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.text();
}

function extractPageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() || null : null;
}

export interface FetchedChapterList {
  bookTitle: string | null;
  chapters: ChapterListItem[];
}

export async function fetchChapterList(bookUrl: string): Promise<FetchedChapterList> {
  const html = await fetchHtml(bookUrl);
  const adapter = resolveAdapter(bookUrl);
  const chapters = adapter
    ? adapter.getChapterList(html, bookUrl)
    : extractChapterList(html, bookUrl);

  if (chapters.length === 0) {
    throw new Error(
      "Could not find a chapter list on this page. The generic extractor is " +
        "unvalidated against real sites (see docs/ARCHITECTURE.md) -- this " +
        "site's structure may need a dedicated adapter."
    );
  }

  return { bookTitle: extractPageTitle(html), chapters };
}

export interface FetchedChapterContent {
  title: string | null;
  rawText: string;
}

export async function fetchChapterContent(chapterUrl: string): Promise<FetchedChapterContent> {
  const html = await fetchHtml(chapterUrl);
  const adapter = resolveAdapter(chapterUrl);
  const extracted = adapter
    ? adapter.getChapterContent(html, chapterUrl)
    : extractChapterContent(html);

  const rawText = filterBlacklist(extracted.text);
  if (!rawText.trim()) {
    throw new Error(
      "Could not extract chapter content from this page. The generic " +
        "extractor is unvalidated against real sites (see docs/ARCHITECTURE.md)."
    );
  }
  return { title: extracted.title, rawText };
}
