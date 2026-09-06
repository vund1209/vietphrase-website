// Rewrites a fetched page's HTML for Browse mode (src/app/surf/browse/page.tsx):
// strips anything that could execute in our own origin (script tags,
// inline event handlers, javascript: URLs -- we're serving fetched
// third-party markup under our own domain, so this is essential, not
// optional), absolute-izes asset URLs so images/CSS keep loading from
// the original site, rewrites same-site links to stay inside the proxy,
// and translates text nodes in place. Deliberately no JS-driven
// interactivity survives -- confirmed scope is "navigate between pages",
// not full site functionality (search/forms/login etc).
import * as cheerio from "cheerio";
import { translateText } from "@/lib/tokenizer";
import { ensureDictionaryDb } from "@/lib/dictionaryDb";

const SKIP_TEXT_TAGS = new Set(["script", "style", "noscript", "svg", "textarea"]);

function isSameSite(a: URL, b: URL): boolean {
  return a.hostname === b.hostname;
}

function absoluteUrl(value: string | undefined, base: URL): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function translateTextNodesIn(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<import("domhandler").AnyNode>
): void {
  root.contents().each((_, node) => {
    if (node.type === "text") {
      const original = $(node).text();
      if (original.trim()) {
        $(node).replaceWith(translateText(original));
      }
      return;
    }
    if (node.type === "tag" && !SKIP_TEXT_TAGS.has(node.name)) {
      translateTextNodesIn($, $(node));
    }
  });
}

export interface ProxyPageOptions {
  pageUrl: string;
  translate: boolean;
}

/**
 * Rewrites raw HTML for Browse mode. `pageUrl` is the URL this HTML was
 * fetched from (used to resolve relative links/assets).
 */
export async function buildProxyPage(
  html: string,
  { pageUrl, translate }: ProxyPageOptions
): Promise<string> {
  // Belt-and-suspenders alongside instrumentation.ts's register() hook --
  // see src/lib/novels.ts's getOrTranslateChapter for why this exists.
  if (translate) await ensureDictionaryDb();

  const $ = cheerio.load(html);
  const base = new URL(pageUrl);

  // Security: strip everything that could execute script in our origin.
  $("script").remove();
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    for (const attr of Object.keys(el.attribs)) {
      if (attr.toLowerCase().startsWith("on")) {
        $(el).removeAttr(attr);
      }
    }
    const href = el.attribs.href;
    if (href && /^\s*javascript:/i.test(href)) $(el).removeAttr("href");
    const src = el.attribs.src;
    if (src && /^\s*javascript:/i.test(src)) $(el).removeAttr("src");
  });

  // Assets: absolute-ize so they keep loading straight from the source site.
  $("img[src], source[src], link[href], img[srcset]").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src");
    const absoluteSrc = absoluteUrl(src, base);
    if (absoluteSrc) $el.attr("src", absoluteSrc);
    const href = $el.attr("href");
    const absoluteHref = absoluteUrl(href, base);
    if (absoluteHref) $el.attr("href", absoluteHref);
  });

  // Links: same-site links stay inside the proxy; everything else (ads,
  // unrelated domains) points straight at the real target.
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const target = absoluteUrl($el.attr("href"), base);
    if (!target) return;
    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      return;
    }
    if (isSameSite(base, targetUrl)) {
      const proxied = `/surf/browse?url=${encodeURIComponent(target)}&translate=${translate ? "1" : "0"}`;
      $el.attr("href", proxied);
    } else {
      $el.attr("href", target);
    }
  });

  if (translate) {
    translateTextNodesIn($, $("body"));
  }

  return $("body").html() ?? "";
}
