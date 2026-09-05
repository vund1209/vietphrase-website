// Shared VietPhraseTokenizer singleton, used by both /api/translate (no
// novel context) and the reading-library chapter routes (per-novel
// overrides, see docs/ARCHITECTURE.md "Data split"). One SQLite
// connection per process, opened lazily on first use.
import { VietPhraseTokenizer } from "@vietphrase/tokenizer";
import type { TokenSource } from "@vietphrase/tokenizer";
import { needsSpaceBetween } from "./tokenSpacing.ts";
import { resolveDbPath } from "./dictionaryDb.ts";

let tokenizer: VietPhraseTokenizer | undefined;

export function getTokenizer(): VietPhraseTokenizer {
  if (!tokenizer) {
    tokenizer = new VietPhraseTokenizer(resolveDbPath());
  }
  return tokenizer;
}

export interface DisplayToken {
  chinese: string;
  vietnamese: string;
  /**
   * The full stored value behind `vietnamese`, e.g. "a/b/c" if the
   * dictionary entry has multiple candidate translations -- `vietnamese`
   * is just pickAlternative's first pick. Exposed so the span editor can
   * show/edit every candidate, not just the one currently displayed.
   */
  rawVietnamese: string;
  source: TokenSource;
  /**
   * Character-by-character Sino-Vietnamese reading of `chinese`,
   * independent of `vietnamese` -- shown in the interactive reader's
   * hover tooltip and edit panel so a reader can compare the literal
   * reading against the contextual VietPhrase translation. See
   * docs/ARCHITECTURE.md "User management and per-word overrides".
   */
  hanViet: string;
  /**
   * The capitalization style behind this token's forced capitalization,
   * if any -- "NONE" unless this token came from a Name/UserWordOverride
   * entry with one set. Exposed so the span editor can prefill the
   * current style when re-opening an existing entry for editing.
   */
  capStyle: CapStyle;
}

// Deliberately a plain string union, not Prisma's generated NameCapStyle
// enum -- this file (and packages/tokenizer) stay decoupled from
// Postgres/Prisma; the caller (src/lib/overrides.ts) is responsible for
// mapping its Postgres-shaped rows into this shape.
export type CapStyle = "NONE" | "FIRST_LETTER" | "ALL_WORDS";

function capitalizeFirstLetter(text: string): string {
  return text.replace(/^([^\p{L}]*)(\p{L})/u, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

// A dictionary entry's forced display style, independent of sentence
// position -- e.g. a person's full name should always read fully
// capitalized ("Trương Vũ Cách"), not just when it happens to start a
// sentence. See prisma/schema.prisma's NameCapStyle enum.
function applyCapStyle(text: string, style: CapStyle): string {
  if (style === "ALL_WORDS") {
    return text.replace(/(^|\s)(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
  }
  if (style === "FIRST_LETTER") {
    return capitalizeFirstLetter(text);
  }
  return text;
}

// Only tokens matched from the `overrides` map (per-novel Name rows or a
// reader's personal UserWordOverride rows) can carry a capStyle --
// packages/tokenizer's tokenizer.mjs tags every overrides-map hit
// "name" regardless of which Postgres table it came from, so this
// uniformly covers both the shared and personal dictionaries.
function applyCapStyles(line: DisplayToken[], capStyles?: Map<string, CapStyle>): DisplayToken[] {
  return line.map((token) => {
    const style: CapStyle =
      token.source === "name" ? capStyles?.get(token.chinese) ?? "NONE" : "NONE";
    if (style === "NONE") return token.capStyle === "NONE" ? token : { ...token, capStyle: style };
    return { ...token, vietnamese: applyCapStyle(token.vietnamese, style), capStyle: style };
  });
}

// Punctuation has no dictionary entry, so it passes through the
// "unmatched" fallback exactly as scraped -- but fullwidth CJK
// punctuation (，。！？ etc.) is designed to occupy a full CJK character
// cell, 2-3x wider than a narrow Latin comma/period. Left as-is, it
// reads as broken/gappy in otherwise-Latin Vietnamese prose (a lone
// fullwidth comma can render as wide as an entire short word). Normalize
// to the narrow equivalents actually used in written Vietnamese --
// `token.chinese` (used for span-selection/editing) is untouched, only
// the displayed `vietnamese` changes.
const FULLWIDTH_PUNCTUATION: Record<string, string> = {
  "，": ",",
  "。": ".",
  "！": "!",
  "？": "?",
  "；": ";",
  "：": ":",
  "、": ",",
  "（": "(",
  "）": ")",
  "【": "[",
  "】": "]",
  "“": "\"",
  "”": "\"",
  "‘": "'",
  "’": "'",
  "…": "...",
};

function normalizePunctuation(line: DisplayToken[]): DisplayToken[] {
  return line.map((token) => {
    const replacement = FULLWIDTH_PUNCTUATION[token.chinese];
    return replacement ? { ...token, vietnamese: replacement } : token;
  });
}

// The dictionary stores translations lowercase (it has no notion of
// sentence position), so without this every sentence/paragraph reads
// entirely lowercase -- capitalize the first letter of each line and of
// whatever follows a sentence-ending punctuation token. Punctuation is
// its own token (an "unmatched" passthrough, since the dictionary has no
// entries for it), so this only ever touches token boundaries, never
// splits a word.
const SENTENCE_END_RE = /^[.!?。！？]+$/;

function applySentenceCapitalization(line: DisplayToken[]): DisplayToken[] {
  let capitalizeNext = true;
  return line.map((token) => {
    const chinese = token.chinese.trim();
    const shouldCapitalize = capitalizeNext;
    if (SENTENCE_END_RE.test(chinese)) {
      capitalizeNext = true;
    } else if (chinese.length > 0) {
      capitalizeNext = false;
    }
    if (!shouldCapitalize) return token;
    const vietnamese = capitalizeFirstLetter(token.vietnamese);
    return vietnamese === token.vietnamese ? token : { ...token, vietnamese };
  });
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
export function tokenizeLines(
  text: string,
  overrides?: Map<string, string>,
  capStyles?: Map<string, CapStyle>
): DisplayToken[][] {
  const tok = getTokenizer();
  return text.split("\n").map((line) => {
    if (!line.trim()) return [];
    const tokens: DisplayToken[] = tok.tokenize(line, { overrides }).map((t) => ({
      chinese: t.chinese,
      vietnamese: t.vietnamese,
      rawVietnamese: t.rawVietnamese,
      source: t.source,
      hanViet: t.hanViet,
      capStyle: "NONE",
    }));
    return applySentenceCapitalization(applyCapStyles(normalizePunctuation(tokens), capStyles));
  });
}

function joinTokensNaturally(tokens: DisplayToken[]): string {
  let result = "";
  tokens.forEach((t, i) => {
    result += t.vietnamese;
    if (i < tokens.length - 1 && needsSpaceBetween(t.chinese, tokens[i + 1].chinese)) result += " ";
  });
  return result;
}

/**
 * Flat-string translation, built from tokenizeLines -- used where only
 * plain text is needed: the standalone /translate page (no novel
 * context) and a chapter's anonymous-reader render (see
 * src/lib/novels.ts's getOrTranslateChapter -- computed fresh per
 * request, never cached).
 */
export function translateText(
  text: string,
  overrides?: Map<string, string>,
  capStyles?: Map<string, CapStyle>
): string {
  return tokenizeLines(text, overrides, capStyles)
    .map((line) => joinTokensNaturally(line))
    .join("\n");
}

/**
 * Full Sino-Vietnamese (Hán Việt) reading of a string, e.g. for showing
 * a novel's original title alongside its VietPhrase translation. Same
 * shape as translateText, joining hanViet instead of vietnamese.
 */
export function hanVietOf(text: string, overrides?: Map<string, string>): string {
  return tokenizeLines(text, overrides)
    .map((line) => line.map((t) => t.hanViet).join(" "))
    .join("\n");
}
