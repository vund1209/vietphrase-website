// Pure, dependency-free helper for deciding whether two adjacent
// VietPhrase tokens need a space between them when rendered/joined.
// Joining every token with a uniform space reads as choppy/broken --
// punctuation ends up floating as its own oddly-spaced "word" ("mở ,
// Trương" instead of "mở, Trương"). Matches both full-width
// (Chinese-style) and half-width (Latin-style) punctuation, since
// scraped source text mixes both depending on the site.
//
// Kept separate from src/lib/tokenizer.ts (which pulls in the
// node:sqlite-backed tokenizer and can't be bundled for the browser) so
// the interactive reader (a client component) can import this directly
// instead of duplicating it.
const NO_SPACE_BEFORE_RE = /^[，。！？；：、）】》’”"'.,;:!?)\]]+$/;
const NO_SPACE_AFTER_RE = /^[（【《‘“"'([]+$/;

export function needsSpaceBetween(aChinese: string, bChinese: string): boolean {
  if (NO_SPACE_BEFORE_RE.test(bChinese.trim())) return false;
  if (NO_SPACE_AFTER_RE.test(aChinese.trim())) return false;
  return true;
}
