// CJK Unified Ideographs (U+4E00-U+9FFF) plus CJK Extension A
// (U+3400-U+4DBF) -- covers the overwhelming majority of real chapter
// text. Deliberately not exhaustive (rarer Extension B+ characters are
// out of scope here, same as packages/tokenizer's hanviet_fallback
// coverage gap noted in docs/VIETPHRASE_CORE.md).
const CJK_RANGE = /[一-鿿㐀-䶿]/g;

export function cjkCount(text: string): number {
  const matches = text.match(CJK_RANGE);
  return matches ? matches.length : 0;
}
