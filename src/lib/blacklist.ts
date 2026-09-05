// Applies data/seed/dictionary_seed.db's scrape_blacklist patterns (ad/
// watermark/forum-footer text) to freshly scraped chapter content,
// before it ever reaches the tokenizer. See docs/VIETPHRASE_CORE.md
// "scrape_blacklist". Loaded once per process; 274 rows, negligible
// memory/time cost.
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = path.join(process.cwd(), "data", "seed", "dictionary_seed.db");

let patterns: string[] | undefined;

function loadPatterns(): string[] {
  if (!patterns) {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
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
