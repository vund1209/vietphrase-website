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
}

export interface TokenizerOptions {
  pickAlternative?: (alternatives: string) => string;
  maxScanLength?: number;
}

export interface TokenizeContext {
  novelId?: number;
}

export declare class VietPhraseTokenizer {
  constructor(dbPath: string, options?: TokenizerOptions);
  maxScanLength: number;
  tokenize(text: string, context?: TokenizeContext): Token[];
  close(): void;
}
