import { test } from "node:test";
import assert from "node:assert/strict";
import { translateText, tokenizeLines } from "./tokenizer.ts";

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
