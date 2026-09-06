// Curated registry of known "import chapters from a URL" sources for
// self-created novels -- same "interface + array + resolve-by-match"
// idiom as src/lib/extract/adapters.ts's SiteAdapter/ADAPTERS/
// resolveAdapter and src/lib/discoverSources.ts's DiscoverSource
// registry, applied to a different domain (downloading a whole file to
// hand to the existing .txt-chunking pipeline, not scraping HTML).
import { megaMatches, megaFetchFile, type DownloadProgress } from "./mega.ts";

export type { DownloadProgress };

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
   *
   * `onProgress` is best-effort -- a provider that can't report
   * byte-level progress (e.g. one where the whole file only becomes
   * available at once, not as a stream) is free to just never call it.
   */
  fetchFile(
    url: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ buffer: ArrayBuffer; filename: string | null }>;
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
