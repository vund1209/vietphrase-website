import { test } from "node:test";
import assert from "node:assert/strict";
import { findTocLink, fetchChapterList, selectNewChapters } from "./scraper.ts";

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

test("fetchChapterList follows the sfacg two-hop via its adapter, merging every volume on the real TOC", async (t) => {
  // Regression test for the "sfacg-530508" bug: the landing page's
  // footer/recommended/genre-nav chrome used to false-positive-match as
  // a chapter list in the generic extractor, so chapters.length > 0
  // there and the two-hop TOC-follow below never fired. The
  // book.sfacg.com adapter now reports 0 chapters on the landing page
  // (no .story-catalog there), which lets the hop reach the real TOC.
  const landingHtml = `
    <html><head>
      <title>Some Novel - SF轻小说</title>
      <meta name="description" content="SF轻小说提供Some Novel小说在线阅读">
    </head><body>
      <div class="d-summary">
        <div class="summary-pic"><img src="/cover.jpg"></div>
        <div class="summary-content">
          <h1 class="title"><span class="text">真实书名<span class="tag blue">VIP</span></span></h1>
          <div class="author-info"><div class="author-name"><span>真实作者</span></div></div>
          <p class="introduce">真实简介第一句。
真实简介第二句。</p>
        </div>
      </div>
      <div class="footer">
        <a href="https://www.sfacg.com/Extending/hire.html">招聘</a>
        <a href="https://www.sfacg.com/Extending/Announce.html">免责声明</a>
        <a href="https://www.sfacg.com/Extending/CopyRight.html">版权隐私</a>
        <a href="https://www.sfacg.com/Extending/ContactUs.html">联系方式</a>
        <a href="http://www.miibeian.gov.cn/">粤ICP备10062407号</a>
      </div>
      <a href="/Novel/530508/MainIndex/">点击阅读</a>
    </body></html>
  `;
  const mainIndexHtml = `
    <html><body>
      <div class="story-catalog">
        <div class="catalog-list">
          <ul class="clearfix">
            <li><a href="/Novel/530508/1/1/" title="第一章 初入江湖">第一章 初入江湖</a></li>
          </ul>
        </div>
      </div>
      <div class="story-catalog">
        <div class="catalog-list">
          <ul class="clearfix">
            <li><a href="/vip/c/999/" title="第二章 风起云涌">第二章 风起云涌</a></li>
          </ul>
        </div>
      </div>
    </body></html>
  `;

  t.mock.method(globalThis, "fetch", async (url: string) => {
    const html = url.includes("MainIndex") ? mainIndexHtml : landingHtml;
    return { ok: true, status: 200, statusText: "OK", text: async () => html } as Response;
  });

  const result = await fetchChapterList("https://book.sfacg.com/Novel/530508/");
  assert.equal(result.chapters.length, 2);
  assert.equal(result.chapters[0].title, "第一章 初入江湖");
  assert.equal(result.chapters[1].url, "https://book.sfacg.com/vip/c/999/");

  // The adapter's markup-based metadata should win over the generic
  // og:.../meta[name=description] extraction (see BookMeta's doc comment
  // in src/lib/extract/types.ts) -- confirms the real title/synopsis/
  // author/cover are used instead of the page's generic SEO blurb.
  assert.equal(result.bookTitle, "真实书名");
  assert.equal(result.description, "真实简介第一句。\n真实简介第二句。");
  assert.equal(result.author, "真实作者");
  assert.equal(result.coverImageUrl, "https://book.sfacg.com/cover.jpg");
});

test("selectNewChapters keeps only fetched chapters not already stored, by sourceUrl", () => {
  const existing = new Set(["https://example.com/c/1", "https://example.com/c/2"]);
  const fetched = [
    { title: "Chương 1", url: "https://example.com/c/1" },
    { title: "Chương 2", url: "https://example.com/c/2" },
    { title: "Chương 3", url: "https://example.com/c/3" },
  ];
  const result = selectNewChapters(existing, fetched);
  assert.deepEqual(result, [{ title: "Chương 3", url: "https://example.com/c/3" }]);
});

test("selectNewChapters returns everything when nothing is stored yet", () => {
  const fetched = [{ title: "Chương 1", url: "https://example.com/c/1" }];
  assert.deepEqual(selectNewChapters(new Set(), fetched), fetched);
});

test("selectNewChapters returns nothing new when the fetched list is a subset of what's stored", () => {
  const existing = new Set(["https://example.com/c/1", "https://example.com/c/2"]);
  const fetched = [{ title: "Chương 1", url: "https://example.com/c/1" }];
  assert.deepEqual(selectNewChapters(existing, fetched), []);
});
