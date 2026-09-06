import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSite } from "./registry.ts";

// Fixtures below mirror fanqienovel.com's real structure (confirmed by
// inspecting a real live chapter/landing page's DOM directly): chapter
// pages carry two literal <h1> elements, h1.muye-reader-nav-title (the
// *book* title, appears first in DOM order) then h1.muye-reader-title
// (the real chapter title) -- the generic extractor's title logic takes
// the first h1 unconditionally, so this site's override is what makes
// the distinction. Placeholder titles/text below, not real book content.

test("fanqienovel.com site matches by hostname", () => {
  const site = resolveSite("https://fanqienovel.com/page/1");
  assert.equal(site?.id, "fanqie");
});

test("getChapterContent resolves the real chapter title, not the book-title nav h1", async () => {
  const html = `
    <html><body>
      <div class="muye-reader-box-header">
        <h1 class="muye-reader-nav-title">Tên truyện mẫu</h1>
      </div>
      <div class="muye-reader-box-header">
        <h1 class="muye-reader-title">Chương mẫu số hai</h1>
      </div>
      <div class="muye-reader-content">
        <p>một hai ba bốn năm sáu bảy tám chín mười một hai ba bốn</p>
        <p>mười một mười hai mười ba mười bốn mười lăm mười sáu mười bảy</p>
      </div>
    </body></html>
  `;
  const site = resolveSite("https://fanqienovel.com/reader/1")!;
  // No @font-face/.otf URL in this fixture -- deobfuscateFanqieText finds
  // nothing to decode and passes the title through unchanged, same as a
  // page from before this feature existed.
  const result = await site.getChapterContent(html, "https://fanqienovel.com/reader/1");
  assert.equal(result.title, "Chương mẫu số hai");
});

test("getBookMeta resolves title/description/author/cover from real classes, not og: tags", () => {
  const html = `
    <html><head><title>Tên truyện mẫu_SEO suffix here</title></head><body>
      <h1>Tên truyện mẫu</h1>
      <div class="page-abstract-content">Đoạn giới thiệu mẫu, không có hậu tố SEO.</div>
      <span class="author-name-text">Tác giả mẫu</span>
      <img class="book-cover-img" src="//p1-tt.byteimg.com/cover/mau.jpg">
    </body></html>
  `;
  const site = resolveSite("https://fanqienovel.com/page/1")!;
  const meta = site.getBookMeta!(html, "https://fanqienovel.com/page/1");
  assert.equal(meta.title, "Tên truyện mẫu");
  assert.equal(meta.description, "Đoạn giới thiệu mẫu, không có hậu tố SEO.");
  assert.equal(meta.author, "Tác giả mẫu");
  assert.equal(meta.coverImageUrl, "https://p1-tt.byteimg.com/cover/mau.jpg");
});

test("fanqienovel.com has no discover config (Discover mode gap, msToken-gated endpoints)", () => {
  const site = resolveSite("https://fanqienovel.com/page/1")!;
  assert.equal(site.discover, undefined);
});
