import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSite } from "./registry.ts";

// Fixtures below mirror the real structure of book.sfacg.com/Novel/530508/
// (landing page) and book.sfacg.com/Novel/530508/MainIndex/ (real TOC),
// trimmed to the parts that fooled the generic extractor (extract/chapterList.ts):
// footer utility links, a same-origin "recommended books" widget, and a
// genre-nav sidebar all clustered well enough to look like a chapter
// list on the landing page, and the real TOC splits chapters across one
// container per volume.

test("book.sfacg.com site matches by hostname", () => {
  const site = resolveSite("https://book.sfacg.com/Novel/530508/");
  assert.equal(site?.id, "sfacg");
  assert.equal(resolveSite("https://example.com/book/1"), null);
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
  const site = resolveSite("https://book.sfacg.com/Novel/530508/");
  const chapters = site!.getChapterList(html, "https://book.sfacg.com/Novel/530508/");
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
  const site = resolveSite("https://book.sfacg.com/Novel/530508/MainIndex/");
  const chapters = site!.getChapterList(html, "https://book.sfacg.com/Novel/530508/MainIndex/");
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
// page's DOM directly (Discover mode).
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
  const site = resolveSite("https://book.sfacg.com/List/");
  const books = site!.discover!.getBookList(html, "https://book.sfacg.com/List/");

  assert.equal(books.length, 2);
  assert.deepEqual(books[0], {
    title: "Truyện mẫu một",
    description: null,
    author: "Tác giả A",
    coverImageUrl: "http://rs.sfacg.com/cover/one.jpg",
    url: "https://book.sfacg.com/Novel/100001/",
  });
  assert.equal(books[1].title, "Truyện mẫu hai");
  assert.equal(books[1].coverImageUrl, null);
  assert.ok(!books.some((b) => b.url.includes("999999")));
});
