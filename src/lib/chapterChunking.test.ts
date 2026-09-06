import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSourceLanguage, chunkNovelText } from "./chapterChunking.ts";

test("detects Chinese source text by Han-character ratio", () => {
  assert.equal(detectSourceLanguage("他好，今天天气很好。"), "ZH");
});

test("detects already-Vietnamese text", () => {
  assert.equal(detectSourceLanguage("Hôm nay trời đẹp, anh ấy rất vui."), "VI");
});

test("empty text defaults to VI", () => {
  assert.equal(detectSourceLanguage("   \n  "), "VI");
});

test("splits on CJK '第N章' heading markers", () => {
  const text = ["第一章 开始", "正文甲", "第二章 继续", "正文乙"].join("\n");
  const chapters = chunkNovelText(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, "第一章 开始");
  assert.equal(chapters[0].rawText, "正文甲");
  assert.equal(chapters[1].title, "第二章 继续");
  assert.equal(chapters[1].rawText, "正文乙");
});

test("splits on 'Chương N' heading markers", () => {
  const text = ["Chương 1", "noi dung mot", "Chương 2", "noi dung hai"].join("\n");
  const chapters = chunkNovelText(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, "Chương 1");
  assert.equal(chapters[1].title, "Chương 2");
});

test("falls back to size-based chunking when no heading markers exist", () => {
  // A sentence boundary just past the 3000-char target, then a second
  // full chunk's worth of content -- forces a real two-chunk split
  // rather than the whole input collapsing into one oversized chunk.
  const paragraph = "一".repeat(3005) + "。" + "二".repeat(3000) + "。";
  const chapters = chunkNovelText(paragraph);
  assert.ok(chapters.length >= 2, "should split into at least 2 chunks");
  assert.equal(chapters[0].title, "Chương 1");
  // First chunk should end right after a sentence-ending punctuation, not mid-run.
  assert.ok(chapters[0].rawText.endsWith("。"));
  assert.equal(chapters[1].title, "Chương 2");
});

test("size-based fallback does not cut mid-sentence when a boundary exists within the overrun window", () => {
  const before = "甲".repeat(3000);
  const after = "乙".repeat(50) + "！";
  const chapters = chunkNovelText(before + after);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].rawText, before + after);
});

test("ignores a heading-shaped line that is implausibly long (not a real heading)", () => {
  const longLine = "第一章 " + "甲".repeat(100);
  const text = [longLine, "正文"].join("\n");
  const chapters = chunkNovelText(text);
  // No valid short heading found -- falls back to size-based chunking,
  // which returns the whole short input as one chunk.
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, "Chương 1");
});

test("splits a heading's body further if it grows far past a normal chapter (undetected markers in that span)", () => {
  // A real heading followed by an enormous, marker-less body (simulating
  // a stretch of the source file whose chapter markers use a format this
  // parser doesn't recognize) must not collapse into one giant chunk --
  // it should still land in file order, just sub-split for readability.
  const hugeBody = ("甲甲甲甲甲甲甲甲甲甲。".repeat(2000) + "\n").repeat(3);
  const text = ["第一章 开始", hugeBody, "第二章 继续", "正文乙"].join("\n");
  const chapters = chunkNovelText(text);
  assert.ok(chapters.length > 3, "the oversized first heading's body should be sub-split");
  assert.equal(chapters[0].title, "第一章 开始 (phần 1)");
  // Every sub-split piece must stay under the cap, and the final real
  // heading must still appear last, in its original order.
  for (const c of chapters.slice(0, -1)) {
    assert.ok(c.rawText.length <= 12000, `chunk too large: ${c.rawText.length}`);
  }
  assert.equal(chapters[chapters.length - 1].title, "第二章 继续");
  assert.equal(chapters[chapters.length - 1].rawText, "正文乙");
});
