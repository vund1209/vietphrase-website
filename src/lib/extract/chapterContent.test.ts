import { test } from "node:test";
import assert from "node:assert/strict";
import { extractChapterContent } from "./chapterContent.ts";

test("extracts prose from <p> tags, ignoring nav/ads/link lists around it", () => {
  const html = `
    <html><head><title>第一章 初入江湖 - 某某小说网</title></head><body>
      <header><a href="/">首页</a><a href="/rank">排行榜</a></header>
      <div class="ad">广告位招租，联系QQ12345</div>
      <div id="content">
        <h1>第一章 初入江湖</h1>
        <p>萧炎缓缓睁开双眼，看着眼前熟悉又陌生的天空，眼中满是茫然。</p>
        <p>三年之约，如今已至，他必须找到答案。</p>
        <p>少年抬头望向远方，心中暗暗发誓，总有一天要找回属于自己的荣耀。</p>
      </div>
      <div class="related-links">
        <a href="/c/2">下一章</a>
        <a href="/c/0">上一章</a>
        <a href="/book/1">目录</a>
      </div>
      <footer><a href="/tos">条款</a></footer>
    </body></html>
  `;
  const result = extractChapterContent(html);
  assert.equal(result.title, "第一章 初入江湖");
  assert.match(result.text, /萧炎缓缓睁开双眼/);
  assert.match(result.text, /三年之约/);
  assert.match(result.text, /总有一天要找回属于自己的荣耀/);
  // Nav/ad text should not have leaked into the extracted body.
  assert.doesNotMatch(result.text, /排行榜|广告位|下一章|上一章/);
});

test("falls back to <title> when no <h1> is present", () => {
  const html = `
    <html><head><title>第二章 风起云涌</title></head><body>
      <div><p>风起于青萍之末，浪成于微澜之间，谁也没想到这场变故会来得如此突然。</p></div>
    </body></html>
  `;
  const result = extractChapterContent(html);
  assert.equal(result.title, "第二章 风起云涌");
  assert.match(result.text, /风起于青萍之末/);
});

test("prefers the container with the most cumulative CJK prose over a single stray paragraph", () => {
  const html = `
    <html><body>
      <div class="sidebar"><p>热门推荐：斗破苍穹，遮天，完美世界，一念永恒，都市极品医神大全集</p></div>
      <div id="content">
        <p>第一段内容，讲述主角初入宗门，拜见掌门，众人皆惊叹其资质不凡。</p>
        <p>第二段内容，主角在藏经阁中苦读功法，日夜不辍，终于小有所成。</p>
        <p>第三段内容，一场突如其来的挑战降临，主角能否化险为夷，尚未可知。</p>
      </div>
    </body></html>
  `;
  const result = extractChapterContent(html);
  assert.match(result.text, /第一段内容/);
  assert.match(result.text, /第二段内容/);
  assert.match(result.text, /第三段内容/);
  assert.doesNotMatch(result.text, /热门推荐/);
});

test("falls back to the single richest block when content isn't split into <p> tags at all", () => {
  const html = `
    <html><body>
      <div id="content">这是一整段没有分段的正文内容，讲述了主角一路上的种种遭遇与心境变化，情节跌宕起伏，扣人心弦。</div>
    </body></html>
  `;
  const result = extractChapterContent(html);
  assert.match(result.text, /这是一整段没有分段的正文内容/);
});

test("splits <br>-separated paragraphs (no <p> tags at all) into distinct lines", () => {
  // Mirrors real-world markup seen on some CJK novel sites (e.g.
  // 69shuba.com's DIV.txtnav), which uses <br> between paragraphs
  // instead of wrapping each one in a <p>.
  const html = `
    <html><head><title>第三章 秘境探险</title></head><body>
      <div class="wrapper">
        <div class="txtnav">
          第一段：主角踏入秘境，四周弥漫着诡异的雾气，让人不寒而栗。<br><br>
          第二段：他握紧手中的长剑，缓缓向密林深处走去，脚步声在寂静中格外清晰。<br><br>
          第三段：忽然，一道黑影从树后闪过，主角瞬间进入戒备状态，气氛骤然紧张起来。
        </div>
      </div>
    </body></html>
  `;
  const result = extractChapterContent(html);
  assert.match(result.text, /第一段：主角踏入秘境/);
  assert.match(result.text, /第二段：他握紧手中的长剑/);
  assert.match(result.text, /第三段：忽然，一道黑影从树后闪过/);
  const lines = result.text.split("\n").filter(Boolean);
  assert.ok(
    lines.length >= 3,
    `expected at least 3 lines, got ${lines.length}: ${JSON.stringify(lines)}`
  );
});
