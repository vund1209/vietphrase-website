// Per-site adapter registry, tried before the generic extractor. Empty
// for now -- no adapters exist yet, per docs/ARCHITECTURE.md "Scraping
// strategy": add one here only once a real target site is confirmed and
// the generic extractor (chapterList.ts / chapterContent.ts)
// demonstrably fails on it.
import type { SiteAdapter } from "./types";

const ADAPTERS: SiteAdapter[] = [];

export function resolveAdapter(url: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}
