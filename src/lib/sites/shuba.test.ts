import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSite } from "./registry.ts";

// Fixtures below mirror 69shuba.com's real structure (confirmed live,
// not guessed): og:description embeds a literal "<br />" artifact
// mid-text, so getBookMeta uses div.navtxt p (real <br> elements)
// instead, converted to newlines. Placeholder titles/text, not real
// book content.

test("69shuba.com site matches by hostname (www. and bare)", () => {
  const site = resolveSite("https://www.69shuba.com/book/1.htm");
  assert.equal(site?.id, "69shuba");
  assert.equal(resolveSite("https://69shuba.com/book/1.htm")?.id, "69shuba");
});

test("getBookMeta prefers div.navtxt p over og:description's <br />-artifact text", () => {
  const html = `
    <html><head>
      <meta property="og:description" content="Đoạn tóm tắt hỏng &lt;br /&gt; có hậu tố lỗi.">
    </head><body>
      <h1><a href="/book/1.htm">Tên truyện mẫu</a></h1>
      <div class="navtxt">
        <p>Dòng giới thiệu một.<br>Dòng giới thiệu hai.<br>Dòng giới thiệu ba.</p>
      </div>
      作者：<a href="/modules/article/author.php?author=abc">Tác giả mẫu</a>
    </body></html>
  `;
  const site = resolveSite("https://www.69shuba.com/book/1.htm")!;
  const meta = site.getBookMeta!(html, "https://www.69shuba.com/book/1.htm");
  assert.equal(meta.title, "Tên truyện mẫu");
  assert.equal(meta.description, "Dòng giới thiệu một.\nDòng giới thiệu hai.\nDòng giới thiệu ba.");
  assert.equal(meta.author, "Tác giả mẫu");
});

test("getBookList takes the FIRST label as author, not the second (serialization-status decoy)", () => {
  const html = `
    <html><body>
      <div class="newbox">
        <ul>
          <li>
            <a class="imgbox" href="/book/1.htm"><img src="https://cdn.example.com/1.jpg"></a>
            <div class="newnav">
              <h3><a href="/book/1.htm">Truyện mẫu một</a></h3>
              <div class="labelbox"><label>Tác giả mẫu</label><label>连载</label></div>
              <ol class="ellipsis_2">Đoạn giới thiệu ngắn mẫu.</ol>
            </div>
          </li>
          <li>
            <a class="imgbox" href="/book/2.htm"><img data-src="https://cdn.example.com/2.jpg"></a>
            <div class="newnav">
              <h3><a href="/book/2.htm">Truyện mẫu hai</a></h3>
              <div class="labelbox"><label>Tác giả khác</label><label>完结</label></div>
            </div>
          </li>
        </ul>
      </div>
    </body></html>
  `;
  const site = resolveSite("https://www.69shuba.com/novels/hot")!;
  const books = site.discover!.getBookList(html, "https://www.69shuba.com/novels/hot");
  assert.equal(books.length, 2);
  assert.equal(books[0].author, "Tác giả mẫu");
  assert.equal(books[0].coverImageUrl, "https://cdn.example.com/1.jpg");
  assert.equal(books[0].description, "Đoạn giới thiệu ngắn mẫu.");
  assert.equal(books[1].author, "Tác giả khác");
  assert.equal(books[1].coverImageUrl, "https://cdn.example.com/2.jpg");
  assert.equal(books[1].description, null);
  assert.ok(!books.some((b) => b.author === "连载" || b.author === "完结"));
});

// Regression: an early version of this site's chapter-list logic
// delegated straight to the generic extractor, which meant a real embed
// attempt stopped at 5 chapters instead of ~569 -- the .htm landing page
// (below) carries a small "latest chapters" preview widget that the
// generic extractor happily accepted as a complete chapter list, so
// scraper.ts's two-hop TOC-follow (which only fires on an EMPTY result)
// never ran. Confirmed live before this fix, then fixed by forcing an
// empty result on the .htm landing page specifically.
test("returns no chapters for the .htm landing page's small preview-widget cluster (forces the two-hop TOC-follow)", () => {
  const html = `
    <html><body>
      <div class="lastest">
        <a href="/txt/1/5">第5章</a>
        <a href="/txt/1/4">第4章</a>
        <a href="/txt/1/3">第3章</a>
        <a href="/txt/1/2">第2章</a>
        <a href="/txt/1/1">第1章</a>
      </div>
      <a href="/book/1/">开始阅读</a>
    </body></html>
  `;
  const site = resolveSite("https://www.69shuba.com/book/1.htm")!;
  const chapters = site.getChapterList(html, "https://www.69shuba.com/book/1.htm");
  assert.equal(chapters.length, 0);
});

test("getChapterList uses the generic extractor on the real TOC page (no .htm suffix)", () => {
  const html = `
    <html><body>
      <ul>
        <li><a href="/txt/1/1">第1章 một</a></li>
        <li><a href="/txt/1/2">第2章 hai</a></li>
        <li><a href="/txt/1/3">第3章 ba</a></li>
      </ul>
    </body></html>
  `;
  const site = resolveSite("https://www.69shuba.com/book/1/")!;
  const chapters = site.getChapterList(html, "https://www.69shuba.com/book/1/");
  assert.equal(chapters.length, 3);
});
