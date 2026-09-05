// Generic chapter-list extraction: given a book/table-of-contents page,
// find the densest cluster of same-ancestor links whose text looks
// chapter-like, in DOM order. See docs/ARCHITECTURE.md "Scraping
// strategy" -- this is heuristic and unvalidated against any real site
// yet (tested only against synthetic fixtures; see chapterList.test.ts).
import * as cheerio from "cheerio";
import type { Element, ParentNode } from "domhandler";
import type { ChapterListItem } from "./types";

// Chapter-label markers identified in docs/DICTIONARY_SOURCES.md's
// grammar-rules work: 章/回/卷/节/節/集/篇, optionally preceded by "第"
// and a numeral run (Arabic digits or CJK numerals).
const CJK_NUMERAL = "[0-9〇一二三四五六七八九十百千两廿卅]+";
const CHAPTER_LABEL_RE = new RegExp(`第?\\s*${CJK_NUMERAL}\\s*[章回卷节節集篇]`);

// Below this many links in a shared-ancestor cluster, the fallback
// (pattern-agnostic) pass doesn't trust the cluster enough to call it a
// chapter list -- too easy to accidentally pick a small nav menu.
const FALLBACK_MIN_CLUSTER = 5;

// Real markup wraps each link in its own <li>/<span>/etc. as often as it
// doesn't, so grouping by *immediate* parent alone misses the common
// "<ul><li><a>...</a></li><li><a>...</a></li></ul>" shape (each anchor's
// immediate parent is a distinct <li>, size-1 "clusters" everywhere).
// Try the closest ancestor level first and only walk further up if it
// doesn't reveal a real cluster, so a page that genuinely does share an
// immediate parent isn't accidentally pulled up to a too-broad ancestor.
const MAX_ANCESTOR_DEPTH = 3;

interface Candidate {
  href: string;
  text: string;
}

function ancestorAtDepth(el: Element, depth: number): ParentNode | null {
  let node: ParentNode | null = el.parent;
  for (let i = 1; i < depth; i++) {
    if (!node || !("parent" in node)) return null;
    node = node.parent;
  }
  return node;
}

function groupByAncestor(
  $: cheerio.CheerioAPI,
  predicate: (text: string) => boolean,
  depth: number
): Map<ParentNode, Candidate[]> {
  const groups = new Map<ParentNode, Candidate[]>();
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const href = $el.attr("href");
    if (!href || !text || !predicate(text)) return;
    const ancestor = ancestorAtDepth(el, depth);
    if (!ancestor) return;
    const list = groups.get(ancestor) ?? [];
    list.push({ href, text });
    groups.set(ancestor, list);
  });
  return groups;
}

function largestGroup(groups: Map<ParentNode, Candidate[]>): Candidate[] {
  let best: Candidate[] = [];
  for (const list of groups.values()) {
    if (list.length > best.length) best = list;
  }
  return best;
}

/**
 * Tries ancestor depths 1..MAX_ANCESTOR_DEPTH in order (closest first),
 * returning the first depth whose largest cluster reaches `minSize`. If
 * none does, returns the largest cluster found across all depths tried
 * (which may be smaller than `minSize`).
 */
function findBestCluster(
  $: cheerio.CheerioAPI,
  predicate: (text: string) => boolean,
  minSize: number
): Candidate[] {
  let best: Candidate[] = [];
  for (let depth = 1; depth <= MAX_ANCESTOR_DEPTH; depth++) {
    const candidate = largestGroup(groupByAncestor($, predicate, depth));
    if (candidate.length >= minSize) return candidate;
    if (candidate.length > best.length) best = candidate;
  }
  return best;
}

export function extractChapterList(html: string, pageUrl: string): ChapterListItem[] {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer").remove();

  // Pass 1: cluster anchors whose text matches a chapter-label pattern.
  let best = findBestCluster($, (t) => CHAPTER_LABEL_RE.test(t), 2);

  // Pass 2 (fallback): no real chapter-label cluster anywhere on the
  // page -- fall back to the densest same-ancestor link cluster
  // regardless of text pattern (e.g. sites that just number chapters,
  // or use English "Chapter N"). Weaker signal, intentionally
  // conservative (FALLBACK_MIN_CLUSTER) since this is the generic
  // extractor's last resort before a dedicated adapter is needed.
  if (best.length < 2) {
    best = findBestCluster($, () => true, FALLBACK_MIN_CLUSTER);
  }

  const seen = new Set<string>();
  const items: ChapterListItem[] = [];
  for (const { href, text } of best) {
    let resolved: string;
    try {
      resolved = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    items.push({ title: text, url: resolved });
  }
  return items;
}
