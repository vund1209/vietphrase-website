export type TokenSource =
  | "name"
  | "pronoun"
  | "word"
  | "hanviet_fallback"
  | "unmatched";

export interface Token {
  source: TokenSource;
  chinese: string;
  vietnamese: string;
  rawVietnamese: string;
  /**
   * Character-by-character Sino-Vietnamese reading of `chinese`,
   * independent of `vietnamese` (the contextual VietPhrase
   * substitution). Always populated.
   */
  hanViet: string;
}

export interface TokenizerOptions {
  pickAlternative?: (alternatives: string) => string;
  maxScanLength?: number;
}

export interface TokenizeContext {
  /**
   * Per-novel Name overrides, chinese phrase -> raw vietnamese value.
   * Fetch these from Postgres's `Name` table for the current novel (one
   * query per chapter translation), not per substring. See
   * docs/ARCHITECTURE.md "Data split".
   */
  overrides?: Map<string, string>;
}

export declare class VietPhraseTokenizer {
  constructor(dbPath: string, options?: TokenizerOptions);
  maxScanLength: number;
  tokenize(text: string, context?: TokenizeContext): Token[];
  close(): void;
}
