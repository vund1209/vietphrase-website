// Shared VietPhraseTokenizer singleton, used by both /api/translate (no
// novel context) and the reading-library chapter routes (per-novel
// overrides, see docs/ARCHITECTURE.md "Data split"). One SQLite
// connection per process, opened lazily on first use.
import path from "node:path";
import { VietPhraseTokenizer } from "@vietphrase/tokenizer";

const DB_PATH = path.join(process.cwd(), "data", "seed", "dictionary_seed.db");

let tokenizer: VietPhraseTokenizer | undefined;

export function getTokenizer(): VietPhraseTokenizer {
  if (!tokenizer) {
    tokenizer = new VietPhraseTokenizer(DB_PATH);
  }
  return tokenizer;
}

/**
 * Translates raw chapter text line by line (preserving paragraph breaks,
 * which the scraper's extractChapterContent already normalized to one
 * "\n" per paragraph), joining each line's tokens with a space.
 */
export function translateText(text: string, overrides?: Map<string, string>): string {
  const tok = getTokenizer();
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "";
      return tok
        .tokenize(line, { overrides })
        .map((t) => t.vietnamese)
        .join(" ");
    })
    .join("\n");
}
