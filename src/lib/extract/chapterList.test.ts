import { test } from "node:test";
import assert from "node:assert/strict";
import { extractChapterList } from "./chapterList.ts";

test("finds a densely-clustered list of chapter-labeled links", () => {
  const html = `
    <html><body>
      <nav><a href="/">Trang chủ</a><a href="/about">Giới thiệu</a></nav>
      <ul id="chapter-list">
        <li><a href="/book/1/1.html">第1章 初入江湖</a></li>
        <li><a href="/book/1/2.html">第2章 风起云涌</a></li>
        <li><a href="/book/1/3.html">第3章 一战成名</a></li>
      </ul>
      <footer><a href="/tos">Điều khoản</a></footer>
    </body></html>
  `;
  const items = extractChapterList(html, "https://example.com/book/1/");
  assert.equal(items.length, 3);
  assert.equal(items[0].title, "第1章 初入江湖");
  assert.equal(items[0].url, "https://example.com/book/1/1.html");
  assert.equal(items[2].url, "https://example.com/book/1/3.html");
});

test("ignores nav/header/footer links entirely, even if a chapter-labeled link is small in number", () => {
  const html = `
    <html><body>
      <header><a href="/x">第1章 (not really a chapter link, just one stray match in header)</a></header>
      <div class="list">
        <a href="/c/1">第一回 楔子</a>
        <a href="/c/2">第二回 出发</a>
      </div>
    </body></html>
  `;
  const items = extractChapterList(html, "https://example.com/c/");
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "第一回 楔子");
});

test("falls back to the densest same-parent link cluster when no chapter-label text matches", () => {
  const html = `
    <html><body>
      <div class="toc">
        <a href="/n/1">序</a>
        <a href="/n/2">壹</a>
        <a href="/n/3">贰</a>
        <a href="/n/4">叁</a>
        <a href="/n/5">肆</a>
        <a href="/n/6">伍</a>
      </div>
    </body></html>
  `;
  const items = extractChapterList(html, "https://example.com/n/");
  assert.equal(items.length, 6);
  assert.equal(items[0].url, "https://example.com/n/1");
});

test("returns an empty list when nothing resembles a chapter list", () => {
  const html = `<html><body><p>Just some prose, no links at all.</p></body></html>`;
  const items = extractChapterList(html, "https://example.com/");
  assert.equal(items.length, 0);
});

test("deduplicates repeated hrefs within the winning cluster", () => {
  const html = `
    <html><body>
      <div class="list">
        <a href="/d/1">第1章</a>
        <a href="/d/1">第1章 (mobile duplicate link, same href)</a>
        <a href="/d/2">第2章</a>
      </div>
    </body></html>
  `;
  const items = extractChapterList(html, "https://example.com/d/");
  assert.equal(items.length, 2);
});
