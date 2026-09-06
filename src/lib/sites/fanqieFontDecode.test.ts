import { test } from "node:test";
import assert from "node:assert/strict";
import { substituteObfuscatedChars } from "./fanqieFontDecode.ts";

// Synthetic glyph map/codepoint map only -- never the real 362-entry
// fanqieFontMap.json, and no network/font-fetching involved. This tests
// the pure substitution logic in isolation from font parsing.

test("substitutes a PUA codepoint using the codepoint->glyphIndex->character chain", () => {
  const codepointToGlyphIndex = new Map([[0xe423, 7]]);
  const glyphMap = { "7": "的" };
  const result = substituteObfuscatedChars("abcdef", codepointToGlyphIndex, glyphMap);
  assert.equal(result, "abc的def");
});

test("falls back to the placeholder for a PUA codepoint with no known glyph index", () => {
  const codepointToGlyphIndex = new Map(); // empty -- current font's cmap doesn't have this codepoint
  const glyphMap = { "7": "的" };
  const result = substituteObfuscatedChars("ab", codepointToGlyphIndex, glyphMap);
  assert.equal(result, "a□b");
});

test("falls back to the placeholder for a glyph index absent from our bootstrapped table", () => {
  const codepointToGlyphIndex = new Map([[0xe423, 999]]); // font resolves it, but we never mapped glyph 999
  const glyphMap = { "7": "的" };
  const result = substituteObfuscatedChars("ab", codepointToGlyphIndex, glyphMap);
  assert.equal(result, "a□b");
});

test("leaves ordinary non-PUA text (Latin, Vietnamese, real Han) untouched", () => {
  const codepointToGlyphIndex = new Map([[0xe423, 7]]);
  const glyphMap = { "7": "的" };
  const result = substituteObfuscatedChars("Xin chào 你好 123", codepointToGlyphIndex, glyphMap);
  assert.equal(result, "Xin chào 你好 123");
});

test("handles multiple distinct PUA codepoints in the same string", () => {
  const codepointToGlyphIndex = new Map([
    [0xe423, 7],
    [0xe424, 8],
  ]);
  const glyphMap = { "7": "的", "8": "了" };
  const result = substituteObfuscatedChars("", codepointToGlyphIndex, glyphMap);
  assert.equal(result, "的了");
});
