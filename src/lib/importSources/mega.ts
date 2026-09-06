// mega.nz "import from URL" provider (src/lib/importSources/providers.ts).
//
// A mega.nz share link isn't a plain downloadable URL -- mega.nz serves
// an SPA at that address; the real file lives behind MEGA's own API,
// addressed by a file-id parsed from the URL path and decrypted with the
// AES key in the URL's `#fragment` (never sent to any server in a
// normal request/redirect). `megajs` (MIT, actively maintained,
// `qgustavor/mega` on GitHub, no native/binary deps) implements MEGA's
// file-sharing protocol so this doesn't have to.
//
// No SSRF surface here unlike src/lib/urlSafety.ts's usual concern:
// megajs always talks to MEGA's own fixed API gateway, never a host
// derived from the submitted URL -- the URL is only ever parsed for an
// id+key. See providers.ts's ImportSourceProvider doc comment for why a
// *future* provider that does its own fetch() against a user-derived
// host needs isSafePublicUrl and this one doesn't.
import { File } from "megajs";

const MEGA_HOSTNAMES = new Set(["mega.nz", "www.mega.nz"]);

// A typical plain-text novel chapter file is a few MB, but a single
// compiled file covering a very long, many-volume work can legitimately
// reach the tens-of-MB range -- confirmed directly against a real
// sample file during this feature's own testing (30MB, a real compiled
// novel, not an edge case to design around only in theory). Set well
// above that with headroom, while still bounding worst-case memory/time
// for a single request.
const MAX_IMPORT_FILE_SIZE_BYTES = 50 * 1024 * 1024;

// megajs has no built-in AbortSignal/timeout option, unlike the native-
// fetch paths elsewhere in this app (src/lib/scraper.ts's FETCH_TIMEOUT_MS,
// src/lib/browserFetch.ts's copy of the same idiom) -- wrapped manually
// below. Racing a timer against the call doesn't cancel the underlying
// in-flight request (megajs gives no hook for that), it just stops
// waiting for it.
//
// 55s (not 20s): confirmed directly (standalone, outside dev-server
// overhead) that a real ~30MB file takes ~26s to download+decrypt with
// maxConnections tuned below -- this needs real margin over
// MAX_IMPORT_FILE_SIZE_BYTES's actual worst-case download time, not an
// arbitrary round number. Set just under vercel.json's maxDuration: 60
// (Vercel Hobby's hard ceiling -- this app's actual deployment tier, so
// there's no raising that number) so this module's own clean timeout
// error fires first, rather than Vercel abruptly killing the whole
// function first.
const MEGA_DOWNLOAD_TIMEOUT_MS = 55_000;

// Single-connection download of the same real 30MB file measured ~35.6s
// -- confirmed 8 parallel connections cuts that to ~26.3s (16 gave no
// further improvement, already bandwidth-saturated at 8). MEGA's
// download protocol is chunk-addressable specifically to support this;
// not using it left real, easy speed on the table given how close a
// large file's total time sits to Vercel's hard 60s ceiling.
const MEGA_DOWNLOAD_MAX_CONNECTIONS = 8;

export class ImportFileTooLargeError extends Error {}
export class ImportDownloadTimeoutError extends Error {}

export interface DownloadProgress {
  bytesLoaded: number;
  bytesTotal: number;
}

export function megaMatches(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      MEGA_HOSTNAMES.has(parsed.hostname) &&
      parsed.pathname.startsWith("/file/") &&
      parsed.hash.length > 1 // "#" plus at least one key character
    );
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ImportDownloadTimeoutError("Tải file quá thời gian cho phép")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function megaFetchFile(
  url: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ buffer: ArrayBuffer; filename: string | null }> {
  return withTimeout(
    (async () => {
      const file = File.fromURL(url);
      await file.loadAttributes();

      if (typeof file.size === "number" && file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
        throw new ImportFileTooLargeError(
          `File quá lớn (${Math.round(file.size / 1024 / 1024)}MB, tối đa ${MAX_IMPORT_FILE_SIZE_BYTES / 1024 / 1024}MB)`
        );
      }

      // download() (a Readable), not downloadBuffer() -- the stream it
      // returns emits real "progress" events ({bytesLoaded, bytesTotal},
      // confirmed directly in megajs's source) as chunks arrive, which
      // downloadBuffer's plain-Promise interface has no hook for at all.
      // A 25-60s wait (this feature's own real, tested timing) is long
      // enough that a static "importing..." label isn't good enough.
      const stream = file.download({ maxConnections: MEGA_DOWNLOAD_MAX_CONNECTIONS });
      if (onProgress) {
        stream.on("progress", (progress: DownloadProgress) => onProgress(progress));
      }

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      const nodeBuffer = Buffer.concat(chunks);
      const buffer = nodeBuffer.buffer.slice(
        nodeBuffer.byteOffset,
        nodeBuffer.byteOffset + nodeBuffer.byteLength
      ) as ArrayBuffer;

      return { buffer, filename: file.name };
    })(),
    MEGA_DOWNLOAD_TIMEOUT_MS
  );
}
