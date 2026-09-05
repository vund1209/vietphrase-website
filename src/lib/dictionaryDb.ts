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
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
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

/**
 * Downloads the dictionary into the OS temp dir if it's not already
 * available somewhere valid. Safe to call on every cold start -- it's a
 * no-op (two fast fs.statSync calls) whenever a valid file already
 * exists, whether that's the real local-dev checkout or an
 * already-downloaded cache from earlier in this same server instance's
 * life.
 */
export async function ensureDictionaryDb(): Promise<void> {
  if (isValidDbFile(LOCAL_DB_PATH) || isValidDbFile(CACHED_DB_PATH)) return;

  const url = process.env.DICTIONARY_DB_URL;
  if (!url) {
    throw new Error(
      `Dictionary file missing at ${LOCAL_DB_PATH} (likely a git-lfs pointer stub, not the real file) ` +
        "and DICTIONARY_DB_URL is not set to fetch a replacement."
    );
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download dictionary from ${url}: ${res.status} ${res.statusText}`);
  }

  // Stream straight to disk (a 200+MB response shouldn't be buffered
  // whole in memory), via a temp path + rename so a failed/interrupted
  // download never leaves a partial file sitting at CACHED_DB_PATH for a
  // later cold start to mistake for valid.
  const downloadPath = `${CACHED_DB_PATH}.download`;
  await pipeline(
    Readable.fromWeb(res.body as NodeWebReadableStream<Uint8Array>),
    fs.createWriteStream(downloadPath)
  );
  await fsp.rename(downloadPath, CACHED_DB_PATH);
}
