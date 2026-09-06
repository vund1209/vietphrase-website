// One-time (and future-maintenance) bootstrap tool for
// src/lib/sites/fanqie.ts's font-deobfuscation table
// (src/lib/sites/fanqieFontMap.json). See that file's own doc comment
// and docs/ARCHITECTURE.md for the full mechanism -- fanqienovel.com
// substitutes real Chinese characters with Private-Use-Area codepoints
// in chapter text, paired with a custom @font-face that renders them
// correctly in a real browser. This script renders every glyph in the
// CURRENT font (labeled by its stable glyph index, not its rotating
// PUA codepoint) into screenshot grids for manual reading -- run this,
// look at the screenshots under ./scratchpad_fanqie_glyphs/, and update
// fanqieFontMap.json's glyphMap by hand.
//
// Usage: node scripts/renderFanqieFontGlyphs.mjs [chapterUrl]
import { chromium } from "playwright";
import opentype from "opentype.js";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_CHAPTER_URL = "https://fanqienovel.com/reader/7665231561104556569";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};
const OUT_DIR = "scratchpad_fanqie_glyphs";
const GLYPHS_PER_GRID = 30;

const chapterUrl = process.argv[2] || DEFAULT_CHAPTER_URL;

const html = await (await fetch(chapterUrl, { headers: HEADERS })).text();
const fontUrlMatch = html.match(/https?:\/\/[^\s"')]+\.otf/);
if (!fontUrlMatch) throw new Error("No .otf @font-face URL found on this chapter page.");
const fontUrl = fontUrlMatch[0];
const fontHash = path.basename(fontUrl, ".otf");
console.log("font url:", fontUrl);
console.log("font hash:", fontHash);

const fontBuf = Buffer.from(await (await fetch(fontUrl, { headers: HEADERS })).arrayBuffer());
const font = opentype.parse(fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength));
console.log("numGlyphs:", font.numGlyphs);

// Reverse-lookup: which CURRENT codepoint renders each glyph index --
// this codepoint rotates over time, but the glyph index (and the real
// character it represents) does not, per the confirmed mechanism.
const glyphIndexToCodepoint = new Map();
for (let cp = 0xe000; cp <= 0xf8ff; cp++) {
  const gid = font.charToGlyphIndex(String.fromCodePoint(cp));
  if (gid > 0 && !glyphIndexToCodepoint.has(gid)) glyphIndexToCodepoint.set(gid, cp);
}
console.log("PUA glyph indices found:", glyphIndexToCodepoint.size);

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const entries = [...glyphIndexToCodepoint.entries()].sort((a, b) => a[0] - b[0]);
const batches = [];
for (let i = 0; i < entries.length; i += GLYPHS_PER_GRID) batches.push(entries.slice(i, i + GLYPHS_PER_GRID));

for (let b = 0; b < batches.length; b++) {
  const cells = batches[b]
    .map(
      ([glyphIndex, cp]) =>
        `<div class="cell"><span class="label">${glyphIndex}</span><span class="glyph">&#x${cp.toString(16)};</span></div>`
    )
    .join("\n");
  const gridHtml = `<!doctype html><html><head><style>
    @font-face { font-family: 'mystery'; src: url('${fontUrl}'); }
    body { background: #fff; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 8px; }
    .cell { border: 1px solid #999; text-align: center; padding: 4px 0; }
    .label { display: block; font-size: 11px; color: #666; font-family: monospace; }
    .glyph { font-family: 'mystery'; font-size: 42px; }
  </style></head><body><div class="grid">${cells}</div></body></html>`;
  await page.setContent(gridHtml);
  await page.waitForTimeout(300); // let the webfont finish loading
  const outPath = path.join(OUT_DIR, `batch_${String(b).padStart(2, "0")}.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log("wrote", outPath, `(${batches[b].length} glyphs)`);
}

await browser.close();
console.log("\nDone. Read each screenshot and record glyphIndex -> real character.");
console.log("fontHash for fanqieFontMap.json:", fontHash);
