// Generic chapter-content extraction: given a single chapter page, find
// the text block with the highest density of CJK characters relative to
// markup/link density (the same class of heuristic as Mozilla's
// Readability). See docs/ARCHITECTURE.md "Scraping strategy".
//
// Validated structurally against two real sites in addition to the
// synthetic fixtures below: book.sfacg.com (clean <p>-per-paragraph
// markup) and 69shuba.com (paragraphs separated by <br> with zero <p>
// tags at all) -- see extractParagraphs() for the <br> handling this
// second pattern requires.
import * as cheerio from "cheerio";
import type { Element, ParentNode } from "domhandler";
import { cjkCount } from "./cjk.ts";
import type { ExtractedChapterContent } from "./types";

const BLOCK_SELECTOR = "div, p, article, section, td";

// A candidate paragraph-like block needs at least this many CJK
// characters directly in it (not counting nested blocks, which are
// scored separately) to count as real prose rather than a stray label.
const MIN_DIRECT_CJK = 8;

// If more than this fraction of a block's direct text sits inside <a>
// tags, treat it as a link list / nav, not prose.
const MAX_LINK_DENSITY = 0.5;

export function extractChapterContent(html: string): ExtractedChapterContent {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, form, button, select, textarea").remove();

  // Readability-style bubbling: score each paragraph-like block by its
  // own direct CJK content, and add that score to its *parent*, so the
  // container that holds many real paragraphs wins over any single
  // paragraph -- without conflating unrelated containers elsewhere on
  // the page.
  const scores = new Map<ParentNode, number>();

  $(BLOCK_SELECTOR).each((_, el) => {
    const $el = $(el);
    const directText = $el.clone().children().remove().end().text();
    const cjk = cjkCount(directText);
    if (cjk < MIN_DIRECT_CJK) return;

    const linkText = $el.find("a").text();
    const linkDensity = directText.length > 0 ? linkText.length / directText.length : 0;
    if (linkDensity > MAX_LINK_DENSITY) return;

    const parent = el.parent;
    if (!parent) return;
    scores.set(parent, (scores.get(parent) ?? 0) + cjk);
  });

  let bestNode: ParentNode | null = null;
  let bestScore = 0;
  for (const [node, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }

  const title = extractTitle($);

  if (!bestNode) {
    // Nothing scored (content isn't split into multiple paragraph-like
    // blocks at all) -- fall back to whichever single block element has
    // the most CJK characters in its full text, nested content included.
    const fallbackContainer = richestBlock($);
    if (!fallbackContainer) return { title, text: "" };
    const paragraphs = extractParagraphs($, fallbackContainer);
    const text = paragraphs.length > 0 ? paragraphs.join("\n\n") : fallbackContainer.text().trim();
    return { title, text: normalizeText(text) };
  }

  const container = $(bestNode);
  const paragraphs = extractParagraphs($, container);
  const text = paragraphs.length > 0 ? paragraphs.join("\n\n") : container.text().trim();

  return { title, text: normalizeText(text) };
}

// Whichever single block element has the most CJK characters in its
// full text (nested content included) -- used when nothing scored via
// the bubbling pass above, i.e. content isn't split into multiple
// paragraph-like blocks at all.
function richestBlock($: cheerio.CheerioAPI): cheerio.Cheerio<Element> | null {
  let best: cheerio.Cheerio<Element> | null = null;
  let bestScore = 0;
  $(BLOCK_SELECTOR).each((_, el) => {
    const text = $(el).text().trim();
    const score = cjkCount(text);
    if (score > bestScore) {
      bestScore = score;
      best = $(el);
    }
  });
  return best;
}

// Extract paragraph strings from a winning container. Prefers real <p>
// children (clean markup, e.g. sfacg.com). Falls back to splitting on
// <br> tags when there are no <p> children at all but there are <br>s
// (plain-text-style markup, e.g. 69shuba.com) -- .text() alone would
// ignore <br> and collapse every paragraph into one unbroken blob, so
// each <br> is converted to a newline before reading the text.
function extractParagraphs($: cheerio.CheerioAPI, container: cheerio.Cheerio<ParentNode>): string[] {
  const pParagraphs: string[] = [];
  container.find("p").each((_, p) => {
    const t = $(p).text().trim();
    if (t) pParagraphs.push(t);
  });
  if (pParagraphs.length > 0) return pParagraphs;

  if (container.find("br").length > 0) {
    const clone = container.clone();
    clone.find("br").replaceWith("\n");
    return clone
      .text()
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return [];
}

function extractTitle($: cheerio.CheerioAPI): string | null {
  const h1 = $("h1").first().text().trim();
  if (h1) return h1;
  const title = $("title").first().text().trim();
  return title || null;
}

function normalizeText(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
