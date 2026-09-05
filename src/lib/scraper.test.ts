import { test } from "node:test";
import assert from "node:assert/strict";
import { findTocLink } from "./scraper.ts";

test("finds a same-origin table-of-contents link by href pattern", () => {
  const html = `
    <html><body>
      <a href="/Novel/530508/MainIndex/">点击阅读</a>
      <a href="https://other-site.com/MainIndex/">外部链接</a>
    </body></html>
  `;
  const result = findTocLink(html, "https://book.sfacg.com/Novel/530508/");
  assert.equal(result, "https://book.sfacg.com/Novel/530508/MainIndex/");
});

test("finds a same-origin table-of-contents link by anchor text pattern", () => {
  const html = `
    <html><body>
      <a href="/book/90442/">开始阅读</a>
    </body></html>
  `;
  const result = findTocLink(html, "https://www.69shuba.com/book/90442.htm");
  assert.equal(result, "https://www.69shuba.com/book/90442/");
});

test("ignores cross-origin links even if the text/href matches", () => {
  const html = `<html><body><a href="https://evil.com/MainIndex/">点击阅读</a></body></html>`;
  const result = findTocLink(html, "https://book.sfacg.com/Novel/530508/");
  assert.equal(result, null);
});

test("returns null when nothing on the page looks like a table of contents", () => {
  const html = `<html><body><a href="/about">关于我们</a><a href="/contact">联系方式</a></body></html>`;
  const result = findTocLink(html, "https://example.com/book/1");
  assert.equal(result, null);
});

test("does not return a self-referencing link", () => {
  const html = `<html><body><a href="/book/1">目录</a></body></html>`;
  const result = findTocLink(html, "https://example.com/book/1");
  assert.equal(result, null);
});
