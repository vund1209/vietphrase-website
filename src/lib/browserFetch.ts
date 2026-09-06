// Fetches raw HTML for src/lib/htmlProxy.ts's link-rewriting proxy
// (Browse mode), with a real headless-browser fallback for sites that
// block a plain server-side fetch (e.g. Cloudflare's JS-challenge page --
// confirmed this blocks 69shuba.com but not fanqienovel.com, tested
// directly against both this session). Not guaranteed to get past every
// tier of bot protection (some specifically fingerprint headless
// browsers too) -- this covers the common "just needs JS execution"
// challenge tier, not interactive CAPTCHA.
//
// @sparticuz/chromium ships a Chromium build for AWS Lambda/Vercel's
// serverless Linux runtime and won't run on a local Windows/macOS dev
// machine, so local dev instead launches a normal locally-installed
// Chromium via the plain `playwright` package (a devDependency -- see
// package.json; run `npx playwright install chromium` once locally).
import { chromium as playwrightChromium, type Browser, type BrowserContext } from "playwright-core";
import { looksLikeBotChallenge } from "./botChallenge.ts";
import { HeadlessBrowserRequiredError } from "./fetchErrors.ts";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

// Same reasoning as src/lib/scraper.ts's FETCH_TIMEOUT_MS -- a hung source
// otherwise stalls the request indefinitely. This module's own headless-
// browser path already times out via page.goto's 30s below; this covers
// the plain-fetch attempt that's tried first.
const FETCH_TIMEOUT_MS = 20_000;

async function fetchPlain(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  return { status: res.status, html: await res.text() };
}

async function launchBrowser(): Promise<Browser> {
  const isProduction = !!process.env.VERCEL;
  if (!isProduction) return playwrightChromium.launch({ headless: true });

  // Dynamic import: @sparticuz/chromium bundles a Linux-only binary that
  // would fail to even load its native bits on a local Windows/macOS dev
  // machine, so it must never be required outside the production branch.
  const chromiumBinary = (await import("@sparticuz/chromium")).default;
  return playwrightChromium.launch({
    args: chromiumBinary.args,
    executablePath: await chromiumBinary.executablePath(),
    headless: true,
  });
}

// Process-local, per-hostname browser context cache -- what actually
// gets a Cloudflare-protected chapter page (not just its book-list
// pages) through headless: confirmed directly that a *fresh, cookie-less*
// browser/context reliably fails Cloudflare's challenge on a 69shuba.com
// chapter URL specifically, but the exact same challenge passes
// immediately when the *same browser context* already holds the cookies
// from a prior successful fetch to that domain (its landing/TOC page,
// which this app's embed flow always fetches first anyway) -- this
// isn't about the URL shape or headless fingerprinting at all, it's
// session state. Previously every single call tore the whole browser
// down (`browser.close()`) immediately after, discarding that state and
// forcing every fetch to re-solve the challenge from zero.
//
// TTL matches Cloudflare's typical clearance-cookie lifetime (rough
// order of magnitude, not sourced from a spec) -- worth revisiting if a
// site's own cookie Expires turns out shorter/longer in practice. Capped
// at a small number of concurrent hostnames (this app only expects a
// couple of Cloudflare-tier sources at a time) so a long-lived warm
// instance can't accumulate an unbounded number of live Chromium
// processes; evicts the whole map past the cap rather than real LRU
// bookkeeping, same simplicity tradeoff as src/lib/novels.ts's
// chapterTokenCache.
const CONTEXT_TTL_MS = 20 * 60 * 1000;
const MAX_CACHED_CONTEXTS = 4;
const contextsByHostname = new Map<string, { browser: Browser; context: BrowserContext; expiresAt: number }>();

async function getOrCreateContext(hostname: string): Promise<BrowserContext> {
  const now = Date.now();
  const cached = contextsByHostname.get(hostname);
  if (cached && cached.expiresAt > now) return cached.context;
  if (cached) await cached.browser.close().catch(() => {});

  if (contextsByHostname.size >= MAX_CACHED_CONTEXTS) {
    for (const { browser } of contextsByHostname.values()) await browser.close().catch(() => {});
    contextsByHostname.clear();
  }

  const browser = await launchBrowser();
  const context = await browser.newContext({ userAgent: FETCH_HEADERS["User-Agent"] });
  contextsByHostname.set(hostname, { browser, context, expiresAt: now + CONTEXT_TTL_MS });
  return context;
}

export async function fetchWithHeadlessBrowser(url: string): Promise<string> {
  const context = await getOrCreateContext(new URL(url).hostname);
  const page = await context.newPage();
  try {
    // "load" (not "networkidle") -- a real 69shuba.com chapter page never
    // reaches network-idle within the 30s budget (persistent background
    // requests -- ads/analytics/comment widgets, common on ad-heavy
    // Chinese novel sites), which made every chapter view of that book
    // fail with a goto timeout under the old setting.
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    return await page.content();
  } finally {
    // Close only the page, not the context/browser -- that's the whole
    // point, keeping the context's cookies alive for the next call to
    // this same hostname. The context itself is closed later, on TTL
    // expiry or eviction above.
    await page.close();
  }
}

export async function fetchRawHtml(
  url: string,
  { allowHeadless = true }: { allowHeadless?: boolean } = {}
): Promise<string> {
  const plain = await fetchPlain(url);
  if (!looksLikeBotChallenge(plain.status, plain.html)) {
    return plain.html;
  }
  if (!allowHeadless) {
    throw new HeadlessBrowserRequiredError(
      "Trang này cần chế độ trình duyệt đầy đủ để tải -- cần đăng nhập để dùng chế độ này."
    );
  }
  return fetchWithHeadlessBrowser(url);
}
