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
