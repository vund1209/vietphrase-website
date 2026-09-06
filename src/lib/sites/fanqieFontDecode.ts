// Reverses fanqienovel.com's font-obfuscation anti-scraping scheme (the
// same technique used by sites like Qidian): chapter text substitutes
// its most common Chinese characters with Private-Use-Area (PUA)
// Unicode codepoints, paired with a custom @font-face that renders them
// correctly in a real browser. Scraping the raw HTML gets the
// substituted codepoints, which is meaningless without the same font.
//
// Confirmed this session (see fanqieFontMap.json's header + git history
// for the exact investigation): the font is currently static (byte-
// identical across 8 unrelated books/chapters tested) and the
// obfuscated set is closed -- 362 glyphs total, corresponding to the
// most common Chinese characters plus ASCII digits/letters, not an
// open-ended pool. Critically, per the mechanism documented by existing
// public tools that solve this exact problem for this exact site (e.g.
// tianhuoDD/fanqienovel-decryptor): **glyph shapes are stable across
// font instances -- only the codepoint-to-glyph-index `cmap` mapping
// rotates.** fanqieFontMap.json's glyphMap (glyph index -> real
// character) was bootstrapped once, by rendering every glyph in the
// current font and reading each one directly (see
// scripts/renderFanqieFontGlyphs.mjs) -- not copied from any other
// project's mapping table (their repos carry no license).
//
// This keeps the runtime path fully deterministic: parse the CURRENT
// font's cmap (fast, a few KB, no rendering) to find which codepoint
// currently points to which glyph index, then look that index up in our
// static table. No recognition/guessing ever happens at request time --
// an unrecognized font (this site rotating to a new one) or an
// unmapped glyph index both degrade safely (left untouched / a visible
// placeholder) rather than silently substituting a wrong character.
// Namespace import, not default or named -- opentype.js's CJS build
// (what plain `node --test` resolves, no "exports" field in its
// package.json) only reliably exposes a `default` (the whole
// module.exports), while its ESM build (what Next.js's bundler resolves
// instead) has no default at all, only named exports -- confirmed by
// hitting both errors directly this session. This works under either.
import * as opentypeModule from "opentype.js";
import fontMapData from "./fanqieFontMap.json" with { type: "json" };

const opentype = ("default" in opentypeModule ? opentypeModule.default : opentypeModule) as typeof opentypeModule;

const PUA_START = 0xe000;
const PUA_END = 0xf8ff;
// A deliberately obvious, never-a-real-character placeholder -- makes an
// unmapped glyph visibly "something is missing here" rather than either
// a confusing raw PUA box glyph or (worse) a silently wrong guess.
const FALLBACK_CHAR = "□"; // □

interface FontMapData {
  fontHash: string;
  glyphMap: Record<string, string>;
}
const fontMap = fontMapData as FontMapData;

interface CachedFont {
  fontHash: string;
  codepointToGlyphIndex: Map<number, number>;
}

// Process-local, same simplicity tradeoff as src/lib/browserFetch.ts's
// per-hostname context cache -- resets on cold start, which is fine
// since re-fetching this one small (~74KB) font file is cheap and only
// happens when the cache is empty or the site has actually rotated fonts.
let cache: CachedFont | null = null;

function extractFontInfo(html: string): { hash: string; otfUrl: string } | null {
  // .otf specifically -- opentype.js can't parse .woff2 without an
  // external decompressor, and this site serves the same font as .otf/
  // .woff/.woff2 variants at the same base URL, confirmed live.
  const urlMatch = html.match(/https?:\/\/[^\s"')]+\.otf/);
  if (!urlMatch) return null;
  const otfUrl = urlMatch[0];
  const hashMatch = otfUrl.match(/([^/]+)\.otf$/);
  if (!hashMatch) return null;
  return { hash: hashMatch[1], otfUrl };
}

async function getCodepointToGlyphIndex(otfUrl: string, hash: string): Promise<Map<number, number>> {
  if (cache && cache.fontHash === hash) return cache.codepointToGlyphIndex;

  const buf = Buffer.from(await (await fetch(otfUrl)).arrayBuffer());
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  const map = new Map<number, number>();
  for (let cp = PUA_START; cp <= PUA_END; cp++) {
    const glyphIndex = font.charToGlyphIndex(String.fromCodePoint(cp));
    if (glyphIndex > 0) map.set(cp, glyphIndex);
  }
  cache = { fontHash: hash, codepointToGlyphIndex: map };
  return map;
}

/** Exported separately for unit testing with a synthetic map -- no network/font parsing involved. */
export function substituteObfuscatedChars(
  text: string,
  codepointToGlyphIndex: ReadonlyMap<number, number>,
  glyphMap: Readonly<Record<string, string>>
): string {
  let result = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < PUA_START || cp > PUA_END) {
      result += ch;
      continue;
    }
    const glyphIndex = codepointToGlyphIndex.get(cp);
    const real = glyphIndex !== undefined ? glyphMap[String(glyphIndex)] : undefined;
    result += real ?? FALLBACK_CHAR;
  }
  return result;
}

export async function deobfuscateFanqieText(html: string, text: string): Promise<string> {
  const info = extractFontInfo(html);
  // No font detected, or it's not the specific font we've bootstrapped a
  // table for (the site rotated) -- skip entirely rather than guess.
  if (!info || info.hash !== fontMap.fontHash) return text;

  try {
    const codepointToGlyphIndex = await getCodepointToGlyphIndex(info.otfUrl, info.hash);
    return substituteObfuscatedChars(text, codepointToGlyphIndex, fontMap.glyphMap);
  } catch {
    // Fetching/parsing the font failed -- this is a nice-to-have
    // enhancement layered on top of extraction that already succeeded;
    // never let it break the chapter read itself.
    return text;
  }
}

// Re-exported for scripts/renderFanqieFontGlyphs.mjs's own doc comment
// and for a future re-bootstrap to sanity-check against.
export const KNOWN_FONT_HASH = fontMap.fontHash;
