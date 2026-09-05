// Shared VietPhraseTokenizer singleton, used by both /api/translate (no
// novel context) and the reading-library chapter routes (per-novel
// overrides, see docs/ARCHITECTURE.md "Data split"). One SQLite
// connection per process, opened lazily on first use.
import path from "node:path";
import { VietPhraseTokenizer } from "@vietphrase/tokenizer";
import type { TokenSource } from "@vietphrase/tokenizer";

const DB_PATH = path.join(process.cwd(), "data", "seed", "dictionary_seed.db");

let tokenizer: VietPhraseTokenizer | undefined;

export function getTokenizer(): VietPhraseTokenizer {
  if (!tokenizer) {
    tokenizer = new VietPhraseTokenizer(DB_PATH);
  }
  return tokenizer;
}

export interface DisplayToken {
  chinese: string;
  vietnamese: string;
  source: TokenSource;
  /**
   * Character-by-character Sino-Vietnamese reading of `chinese`,
   * independent of `vietnamese` -- shown in the interactive reader's
   * hover tooltip and edit panel so a reader can compare the literal
   * reading against the contextual VietPhrase translation. See
   * docs/ARCHITECTURE.md "User management and per-word overrides".
   */
  hanViet: string;
}

/**
 * Tokenizes raw chapter text line by line (preserving paragraph breaks,
 * which the scraper's extractChapterContent already normalized to one
 * "\n" per paragraph), returning each token's Chinese/Vietnamese pair
 * rather than a flat string.
 *
 * This is what the interactive reader renders one clickable span per
 * token from, so a reader can select a single word/phrase and save a
 * personal override for it -- see docs/ARCHITECTURE.md "User management
 * and per-word overrides".
 */
export function tokenizeLines(text: string, overrides?: Map<string, string>): DisplayToken[][] {
  const tok = getTokenizer();
  return text.split("\n").map((line) => {
    if (!line.trim()) return [];
    return tok.tokenize(line, { overrides }).map((t) => ({
      chinese: t.chinese,
      vietnamese: t.vietnamese,
      source: t.source,
      hanViet: t.hanViet,
    }));
  });
}

/**
 * Flat-string translation, built from tokenizeLines -- used where only
 * plain text is needed: the standalone /translate page (no novel
 * context) and the cached shared Chapter.translatedText column (the
 * fast path served to readers with no personal overrides for the
 * novel).
 */
export function translateText(text: string, overrides?: Map<string, string>): string {
  return tokenizeLines(text, overrides)
    .map((line) => line.map((t) => t.vietnamese).join(" "))
    .join("\n");
}
