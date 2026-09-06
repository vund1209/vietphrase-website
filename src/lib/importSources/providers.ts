// Curated registry of known "import chapters from a URL" sources for
// self-created novels -- same "interface + array + resolve-by-match"
// idiom as src/lib/extract/adapters.ts's SiteAdapter/ADAPTERS/
// resolveAdapter and src/lib/discoverSources.ts's DiscoverSource
// registry, applied to a different domain (downloading a whole file to
// hand to the existing .txt-chunking pipeline, not scraping HTML).
import { megaMatches, megaFetchFile } from "./mega.ts";

export interface ImportSourceProvider {
  name: string;
  matches(url: string): boolean;
  /**
   * Downloads the file this URL points to. Implementations that `fetch()`
   * a host derived from the user-submitted URL (unlike the mega
   * provider, which never does -- see mega.ts's header comment) MUST
   * apply src/lib/urlSafety.ts's isSafePublicUrl themselves; this
   * interface doesn't enforce it centrally since not every provider's
   * threat model needs it.
   */
  fetchFile(url: string): Promise<{ buffer: ArrayBuffer; filename: string | null }>;
}

const megaProvider: ImportSourceProvider = {
  name: "mega.nz",
  matches: megaMatches,
  fetchFile: megaFetchFile,
};

const IMPORT_SOURCE_PROVIDERS: ImportSourceProvider[] = [megaProvider];

export function resolveImportSourceProvider(url: string): ImportSourceProvider | null {
  return IMPORT_SOURCE_PROVIDERS.find((p) => p.matches(url)) ?? null;
}
