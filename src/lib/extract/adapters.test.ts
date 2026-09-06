import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAdapter } from "./adapters.ts";

// Fixtures below mirror the real structure of book.sfacg.com/Novel/530508/
// (landing page) and book.sfacg.com/Novel/530508/MainIndex/ (real TOC),
// trimmed to the parts that fooled the generic extractor (chapterList.ts):
// footer utility links, a same-origin "recommended books" widget, and a
// genre-nav sidebar all clustered well enough to look like a chapter
// list on the landing page, and the real TOC splits chapters across one
// container per volume.

test("book.sfacg.com adapter matches by hostname", () => {
  const adapter = resolveAdapter("https://book.sfacg.com/Novel/530508/");
  assert.equal(adapter?.name, "book.sfacg.com");
  assert.equal(resolveAdapter("https://example.com/book/1"), null);
});

test("returns no chapters for the landing page (footer/recommended/genre-nav chrome, no real TOC)", () => {
  const html = `
    <html><head><title>在下只想夺走各位的大宝剑 - SF轻小说</title></head><body>
      <div class="footer">
        <a href="https://www.sfacg.com/Extending/hire.html">招聘</a>
        <a href="https://www.sfacg.com/Extending/Announce.html">免责声明</a>
        <a href="https://www.sfacg.com/Extending/CopyRight.html">版权隐私</a>
        <a href="https://www.sfacg.com/Extending/ContactUs.html">联系方式</a>
        <a href="http://www.miibeian.gov.cn/">粤ICP备10062407号</a>
      </div>
      <div class="recommend">
        <a href="https://book.sfacg.com/Novel/741200/">魔女小姐快把圣剑还给我</a>
        <a href="https://book.sfacg.com/Novel/576245/">我老婆是病娇屑魔女</a>
        <a href="https://book.sfacg.com/Novel/530508/">在下只想夺走各位的大宝剑</a>
        <a href="https://book.sfacg.com/Novel/514094/">失业魔王：剑魔灭世</a>
        <a href="https://book.sfacg.com/Novel/452933/">嘲笑我是舔狗的你们必将被我拿下</a>
      </div>
      <div class="genre-nav">
        <a href="https://book.sfacg.com/List/?tid=21">魔幻</a>
        <a href="https://book.sfacg.com/List/?tid=22">玄幻</a>
        <a href="https://book.sfacg.com/List/?tid=23">古风</a>
      </div>
      <a href="/Novel/530508/MainIndex/">点击阅读</a>
    </body></html>
  `;
  const adapter = resolveAdapter("https://book.sfacg.com/Novel/530508/");
  const chapters = adapter!.getChapterList(html, "https://book.sfacg.com/Novel/530508/");
  assert.equal(chapters.length, 0);
});

test("merges chapters across every per-volume story-catalog container, in order", () => {
  const html = `
    <html><body>
      <div class="story-catalog">
        <h3 class="catalog-title">【book】 第一卷 卷名</h3>
        <div class="catalog-list">
          <ul class="clearfix">
            <li><a href="/Novel/530508/1/1/" title="第一章 初入江湖">第一章 初入江湖</a></li>
            <li><a href="/Novel/530508/1/2/" title="第二章 风起云涌">第二章 风起云涌</a></li>
          </ul>
        </div>
      </div>
      <div class="story-catalog">
        <h3 class="catalog-title">【book】 第二卷 卷名</h3>
        <div class="catalog-list">
          <ul class="clearfix">
            <li><a href="/vip/c/999/" title="第三章 一战成名">第三章 一战成名</a></li>
          </ul>
        </div>
      </div>
    </body></html>
  `;
  const adapter = resolveAdapter("https://book.sfacg.com/Novel/530508/MainIndex/");
  const chapters = adapter!.getChapterList(html, "https://book.sfacg.com/Novel/530508/MainIndex/");
  assert.equal(chapters.length, 3);
  assert.deepEqual(chapters.map((c) => c.title), [
    "第一章 初入江湖",
    "第二章 风起云涌",
    "第三章 一战成名",
  ]);
  assert.equal(chapters[0].url, "https://book.sfacg.com/Novel/530508/1/1/");
  assert.equal(chapters[2].url, "https://book.sfacg.com/vip/c/999/");
});

// Fixture mirrors book.sfacg.com/List/'s real structure: each book is its
// own <ul class="Comic_Pic_List"> (cover-image <li> + text <li>) inside a
// single .comic_cover container -- confirmed by inspecting the live list
// page's DOM directly (Discover mode, planning doc's section 14).
test("getBookList extracts title/author/cover/url per book, scoped to .comic_cover", () => {
  const html = `
    <html><body>
      <div class="comic_cover Blue_link3">
        <ul class="Comic_Pic_List">
          <li class="Conjunction"><a href="/Novel/100001/" target="_blank">
            <img src="http://rs.sfacg.com/cover/one.jpg" width="80" height="100"></a></li>
          <li><strong><a href="/Novel/100001/" target="_blank">Truyện mẫu một</a></strong><br>
            作 者： <a href="/Club/1/">Tác giả A</a><br>
            综合信息： <span class="font_red">5.0分</span> / <a href="/List/?tid=21">魔幻</a> / 2026/1/1 / 1000字<br>
            Đoạn giới thiệu mẫu.</li>
        </ul>
        <ul class="Comic_Pic_List">
          <li class="Conjunction"><a href="/Novel/100002/" target="_blank"></a></li>
          <li><strong><a href="/Novel/100002/" target="_blank">Truyện mẫu hai</a></strong><br>
            作 者： <a href="/Club/2/">Tác giả B</a></li>
        </ul>
      </div>
      <div class="recommend">
        <ul class="Comic_Pic_List">
          <li class="Conjunction"><a href="/Novel/999999/" target="_blank">
            <img src="http://rs.sfacg.com/cover/decoy.jpg"></a></li>
          <li><strong><a href="/Novel/999999/" target="_blank">Không nên xuất hiện</a></strong></li>
        </ul>
      </div>
    </body></html>
  `;
  const adapter = resolveAdapter("https://book.sfacg.com/List/");
  const books = adapter!.getBookList!(html, "https://book.sfacg.com/List/");

  assert.equal(books.length, 2);
  assert.deepEqual(books[0], {
    title: "Truyện mẫu một",
    author: "Tác giả A",
    coverImageUrl: "http://rs.sfacg.com/cover/one.jpg",
    url: "https://book.sfacg.com/Novel/100001/",
  });
  assert.equal(books[1].title, "Truyện mẫu hai");
  assert.equal(books[1].coverImageUrl, null);
  assert.ok(!books.some((b) => b.url.includes("999999")));
});

// Fixtures below mirror fanqienovel.com's real structure (confirmed by
// inspecting a real live chapter/landing page's DOM directly): chapter
// pages carry two literal <h1> elements, h1.muye-reader-nav-title (the
// *book* title, appears first in DOM order) then h1.muye-reader-title
// (the real chapter title) -- the generic extractor's title logic takes
// the first h1 unconditionally, so this adapter's override is what makes
// the distinction. Placeholder titles/text below, not real book content.

test("fanqienovel.com adapter matches by hostname", () => {
  const adapter = resolveAdapter("https://fanqienovel.com/page/1");
  assert.equal(adapter?.name, "fanqienovel.com");
});

test("getChapterContent resolves the real chapter title, not the book-title nav h1", () => {
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
  const adapter = resolveAdapter("https://fanqienovel.com/reader/1")!;
  const result = adapter.getChapterContent(html, "https://fanqienovel.com/reader/1");
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
  const adapter = resolveAdapter("https://fanqienovel.com/page/1")!;
  const meta = adapter.getBookMeta!(html, "https://fanqienovel.com/page/1");
  assert.equal(meta.title, "Tên truyện mẫu");
  assert.equal(meta.description, "Đoạn giới thiệu mẫu, không có hậu tố SEO.");
  assert.equal(meta.author, "Tác giả mẫu");
  assert.equal(meta.coverImageUrl, "https://p1-tt.byteimg.com/cover/mau.jpg");
});

test("fanqienovel.com has no getBookList (Discover mode gap, msToken-gated endpoints)", () => {
  const adapter = resolveAdapter("https://fanqienovel.com/page/1")!;
  assert.equal(adapter.getBookList, undefined);
});

// Fixtures below mirror 69shuba.com's real structure (confirmed live,
// not guessed): og:description embeds a literal "<br />" artifact
// mid-text, so getBookMeta uses div.navtxt p (real <br> elements)
// instead, converted to newlines. Placeholder titles/text, not real
// book content.

test("69shuba.com adapter matches by hostname (www. and bare)", () => {
  const adapter = resolveAdapter("https://www.69shuba.com/book/1.htm");
  assert.equal(adapter?.name, "69shuba.com");
  assert.equal(resolveAdapter("https://69shuba.com/book/1.htm")?.name, "69shuba.com");
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
  const adapter = resolveAdapter("https://www.69shuba.com/book/1.htm")!;
  const meta = adapter.getBookMeta!(html, "https://www.69shuba.com/book/1.htm");
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
  const adapter = resolveAdapter("https://www.69shuba.com/novels/hot")!;
  const books = adapter.getBookList!(html, "https://www.69shuba.com/novels/hot");
  assert.equal(books.length, 2);
  assert.equal(books[0].author, "Tác giả mẫu");
  assert.equal(books[0].coverImageUrl, "https://cdn.example.com/1.jpg");
  assert.equal(books[1].author, "Tác giả khác");
  assert.equal(books[1].coverImageUrl, "https://cdn.example.com/2.jpg");
  assert.ok(!books.some((b) => b.author === "连载" || b.author === "完结"));
});

// Regression: an early version of this adapter delegated getChapterList
// straight to the generic extractor, which meant a real embed attempt
// stopped at 5 chapters instead of ~569 -- the .htm landing page (below)
// carries a small "latest chapters" preview widget that the generic
// extractor happily accepted as a complete chapter list, so
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
  const adapter = resolveAdapter("https://www.69shuba.com/book/1.htm")!;
  const chapters = adapter.getChapterList(html, "https://www.69shuba.com/book/1.htm");
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
  const adapter = resolveAdapter("https://www.69shuba.com/book/1/")!;
  const chapters = adapter.getChapterList(html, "https://www.69shuba.com/book/1/");
  assert.equal(chapters.length, 3);
});
