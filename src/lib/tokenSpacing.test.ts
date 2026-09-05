import { test } from "node:test";
import assert from "node:assert/strict";
import { needsSpaceBetween } from "./tokenSpacing.ts";

test("no space before closing punctuation (comma)", () => {
  assert.equal(needsSpaceBetween("hảo", "，"), false);
});

test("no space before closing punctuation (half-width period)", () => {
  assert.equal(needsSpaceBetween("hảo", "."), false);
});

test("normal space after closing punctuation, before the next word", () => {
  assert.equal(needsSpaceBetween("。", "hắn"), true);
});

test("no space after opening punctuation", () => {
  assert.equal(needsSpaceBetween("“", "hắn"), false);
});

test("normal space between two ordinary words", () => {
  assert.equal(needsSpaceBetween("hắn", "hảo"), true);
});
