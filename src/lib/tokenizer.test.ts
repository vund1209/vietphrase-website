import { test } from "node:test";
import assert from "node:assert/strict";
import { translateText, tokenizeLines, type CapStyle } from "./tokenizer.ts";

// The seed dictionary stores translations lowercase (it has no notion of
// sentence position) -- these guard the capitalization pass added on top
// so reading text doesn't look entirely lowercase.

test("capitalizes the first word of a line", () => {
  assert.equal(translateText("他好"), "Hắn hảo");
});

test("capitalizes after a full-width sentence-ending punctuation token", () => {
  assert.equal(translateText("他好。他好"), "Hắn hảo 。 Hắn hảo");
});

test("does not capitalize mid-sentence words", () => {
  const [line] = tokenizeLines("他好");
  assert.equal(line[1].vietnamese, "hảo");
});

test("each paragraph (line) capitalizes independently", () => {
  assert.equal(translateText("他好\n他好"), "Hắn hảo\nHắn hảo");
});

test("capitalization only changes vietnamese, not rawVietnamese or hanViet", () => {
  const [line] = tokenizeLines("他好");
  assert.equal(line[0].rawVietnamese, "hắn");
  assert.equal(line[0].hanViet, "tha");
});

// Per-entry capitalization style (prisma/schema.prisma's NameCapStyle):
// a name should render its own way regardless of sentence position,
// independent of the sentence-position rule above.

test("ALL_WORDS capitalizes every word of a name-sourced token", () => {
  const overrides = new Map([["张家", "trương gia"]]);
  const capStyles = new Map<string, CapStyle>([["张家", "ALL_WORDS"]]);
  assert.equal(translateText("张家", overrides, capStyles), "Trương Gia");
});

test("FIRST_LETTER only capitalizes the first word of a name-sourced token", () => {
  const overrides = new Map([["张家", "trương gia"]]);
  const capStyles = new Map<string, CapStyle>([["张家", "FIRST_LETTER"]]);
  assert.equal(translateText("张家", overrides, capStyles), "Trương gia");
});

test("capStyle never applies to a non-name-sourced token, even with a matching key", () => {
  // "好" (position 2, mid-sentence -- see "does not capitalize
  // mid-sentence words" above) resolves via the word table (source
  // "word"), not an override -- a capStyles entry for it must have no
  // effect, so it stays lowercase exactly as without one.
  const capStyles = new Map<string, CapStyle>([["好", "ALL_WORDS"]]);
  const [line] = tokenizeLines("他好", undefined, capStyles);
  assert.equal(line[1].source, "word");
  assert.equal(line[1].vietnamese, "hảo");
});
