// Ensures the bulk, read-only VietPhrase dictionary SQLite file
// (words/pronouns/hanviet_fallback/global names -- see
// docs/ARCHITECTURE.md "Data split") is present on disk before anything
// tries to open it.
//
// In local dev, the real file is already checked out at LOCAL_DB_PATH
// (built via data/seed/build_dictionary.py). In production it is NOT
// checked out via git: at ~216MB it's too large for a normal git push
// (GitHub rejects files over 100MB) and Vercel doesn't resolve Git LFS
// pointers, so shipping it through git/the deployment bundle isn't
// viable at all. Instead it's hosted as a GitHub Release asset and
// downloaded once per cold start into the OS temp directory (which
// isn't subject to the deployment bundle size limit), cached there for
// the rest of that server instance's lifetime. See src/instrumentation.ts,
// which calls ensureDictionaryDb() before any request is served.
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

export const LOCAL_DB_PATH = path.join(process.cwd(), "data", "seed", "dictionary_seed.db");
const CACHED_DB_PATH = path.join(os.tmpdir(), "dictionary_seed.db");

// A real dictionary_seed.db is 200+MB; a git-lfs pointer stub (what you
// get if this file were still git-lfs-tracked and checked out somewhere
// that doesn't resolve LFS) is a few hundred bytes. Anything this small
// at LOCAL_DB_PATH means the real file isn't actually there.
const MIN_VALID_SIZE_BYTES = 10 * 1024 * 1024;

function isValidDbFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).size > MIN_VALID_SIZE_BYTES;
  } catch {
    return false;
  }
}

/** Path to actually open with VietPhraseTokenizer -- call only after ensureDictionaryDb() has resolved. */
export function resolveDbPath(): string {
  return isValidDbFile(LOCAL_DB_PATH) ? LOCAL_DB_PATH : CACHED_DB_PATH;
}

// In-memory only -- read by GET /api/dictionary/status for the header's
// status dot (see DictionaryStatusDot.tsx). Per-serverless-instance, like
// everything else here: a status check can land on a *different* warm
// instance than the one actually downloading, so this is a best-effort
// signal, not a guaranteed-accurate one -- still useful, since most cold
// starts happen right after a deploy when there's realistically one or a
// few instances warming up together.
export type DictionaryStatus =
  | { state: "ready" }
  | { state: "downloading"; downloadedBytes: number; totalBytes: number | null }
  | { state: "error"; message: string }
  | { state: "not_started" };

let status: DictionaryStatus = { state: "not_started" };
// De-dupes concurrent callers on the same instance onto one download --
// with every tokenizer-touching route now calling ensureDictionaryDb()
// directly (see the "unable to open database file" fix), several requests
// can legitimately race in on the very first cold-start request at once.
let inFlightDownload: Promise<void> | null = null;

export function getDictionaryStatus(): DictionaryStatus {
  if (isValidDbFile(LOCAL_DB_PATH) || isValidDbFile(CACHED_DB_PATH)) return { state: "ready" };
  return status;
}

/**
 * Downloads the dictionary into the OS temp dir if it's not already
 * available somewhere valid. Safe to call on every cold start -- it's a
 * no-op (two fast fs.statSync calls) whenever a valid file already
 * exists, whether that's the real local-dev checkout or an
 * already-downloaded cache from earlier in this same server instance's
 * life.
 */
export async function ensureDictionaryDb(): Promise<void> {
  if (isValidDbFile(LOCAL_DB_PATH) || isValidDbFile(CACHED_DB_PATH)) {
    status = { state: "ready" };
    return;
  }
  if (inFlightDownload) return inFlightDownload;
  inFlightDownload = downloadDictionaryDb();
  try {
    await inFlightDownload;
  } finally {
    inFlightDownload = null;
  }
}

async function downloadDictionaryDb(): Promise<void> {
  const url = process.env.DICTIONARY_DB_URL;
  if (!url) {
    const message =
      `Dictionary file missing at ${LOCAL_DB_PATH} (likely a git-lfs pointer stub, not the real file) ` +
      "and DICTIONARY_DB_URL is not set to fetch a replacement.";
    status = { state: "error", message };
    throw new Error(message);
  }

  status = { state: "downloading", downloadedBytes: 0, totalBytes: null };
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    const message = `Failed to download dictionary from ${url}: ${err instanceof Error ? err.message : String(err)}`;
    status = { state: "error", message };
    throw new Error(message);
  }
  if (!res.ok || !res.body) {
    const message = `Failed to download dictionary from ${url}: ${res.status} ${res.statusText}`;
    status = { state: "error", message };
    throw new Error(message);
  }

  const totalBytes = Number(res.headers.get("content-length")) || null;
  let downloadedBytes = 0;
  // Counts bytes as they stream through, for the status dot's progress --
  // doesn't change what's written to disk at all. A plain Node Transform
  // (not the Web Streams API) so it drops into pipeline() below without
  // fighting Node's fetch-body vs. lib.dom ReadableStream typings.
  const progressTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloadedBytes += chunk.length;
      status = { state: "downloading", downloadedBytes, totalBytes };
      callback(null, chunk);
    },
  });

  // Stream straight to disk (a 200+MB response shouldn't be buffered
  // whole in memory), via a temp path + rename so a failed/interrupted
  // download never leaves a partial file sitting at CACHED_DB_PATH for a
  // later cold start to mistake for valid.
  //
  // Transparent gzip support: if DICTIONARY_DB_URL points at a `.gz`
  // asset, decompress it as part of this same streaming pipeline (a
  // SQLite file with this much repeated string data compresses well --
  // see the performance plan's Phase 1). Purely additive: an existing
  // uncompressed URL (no `.gz` suffix) keeps working exactly as before,
  // no env-var migration forced by this change.
  const isGzipped = url.endsWith(".gz");
  const downloadPath = `${CACHED_DB_PATH}.download`;
  try {
    const streams = [
      Readable.fromWeb(res.body as NodeWebReadableStream<Uint8Array>),
      progressTransform,
      ...(isGzipped ? [zlib.createGunzip()] : []),
      fs.createWriteStream(downloadPath),
    ];
    await pipeline(streams);
    await fsp.rename(downloadPath, CACHED_DB_PATH);
    status = { state: "ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error downloading dictionary";
    status = { state: "error", message };
    throw err;
  }
}
