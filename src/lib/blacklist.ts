// Applies data/seed/dictionary_seed.db's scrape_blacklist patterns (ad/
// watermark/forum-footer text) to freshly scraped chapter content,
// before it ever reaches the tokenizer. See docs/VIETPHRASE_CORE.md
// "scrape_blacklist". Loaded once per process; 274 rows, negligible
// memory/time cost.
//
// Was previously hardcoded to LOCAL_DB_PATH directly (bypassing
// src/lib/dictionaryDb.ts entirely) -- harmless in local dev, where the
// real file is checked out there, but in production that path is never
// populated at all (the file is downloaded to /tmp at runtime instead,
// see dictionaryDb.ts), so this failed with "unable to open database
// file" on every first-time chapter scrape regardless of whether the
// tokenizer's own copy (a separate connection) was ready.
import { DatabaseSync } from "node:sqlite";
import { resolveDbPath } from "./dictionaryDb.ts";

let patterns: string[] | undefined;

function loadPatterns(): string[] {
  if (!patterns) {
    const db = new DatabaseSync(resolveDbPath(), { readOnly: true });
    const rows = db.prepare("SELECT pattern FROM scrape_blacklist").all() as {
      pattern: string;
    }[];
    db.close();
    patterns = rows.map((r) => r.pattern).filter(Boolean);
  }
  return patterns;
}

/** Strips any line containing one of the blacklist patterns as a substring. */
export function filterBlacklist(text: string): string {
  const pats = loadPatterns();
  return text
    .split("\n")
    .filter((line) => !pats.some((p) => line.includes(p)))
    .join("\n");
}
