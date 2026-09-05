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
import { chromium as playwrightChromium } from "playwright-core";
import { looksLikeBotChallenge } from "./botChallenge.ts";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

async function fetchPlain(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  return { status: res.status, html: await res.text() };
}

export async function fetchWithHeadlessBrowser(url: string): Promise<string> {
  const isProduction = !!process.env.VERCEL;
  const browser = isProduction
    ? await (async () => {
        // Dynamic import: @sparticuz/chromium bundles a Linux-only
        // binary that would fail to even load its native bits on a
        // local Windows/macOS dev machine, so it must never be required
        // outside the production branch.
        const chromiumBinary = (await import("@sparticuz/chromium")).default;
        return playwrightChromium.launch({
          args: chromiumBinary.args,
          executablePath: await chromiumBinary.executablePath(),
          headless: true,
        });
      })()
    : await playwrightChromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ userAgent: FETCH_HEADERS["User-Agent"] });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function fetchRawHtml(url: string): Promise<string> {
  const plain = await fetchPlain(url);
  if (!looksLikeBotChallenge(plain.status, plain.html)) {
    return plain.html;
  }
  return fetchWithHeadlessBrowser(url);
}
