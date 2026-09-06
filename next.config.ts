import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core (headless-browser fallback for bot-protected sites --
  // see src/lib/browserFetch.ts) has to stay a real runtime require, not
  // get bundled: it dynamically loads a native driver binary in a way
  // static bundling can't follow. Without this, Vercel's build was
  // observed failing to trace playwright-core's non-JS `browsers.json`
  // into the deployed function at all. serverExternalPackages fixes the
  // require; outputFileTracingIncludes below is belt-and-suspenders to
  // make sure browsers.json specifically gets traced in.
  //
  // Scoped to just the routes that actually reach a headless-browser
  // launch (via src/lib/scraper.ts's fetchHtml or src/lib/browserFetch.ts's
  // fetchRawHtml), not a blanket "/**" -- see the planning doc's section 9
  // (one of two "clearly wrong as shipped" regressions called out
  // regardless of measurement: every route's deployed function was
  // needlessly bundling this). Every entry that transitively scrapes
  // (book add, metadata/chapter re-fetch, lazy chapter scrape, Surf/Browse):
  outputFileTracingIncludes: {
    "/api/novels": ["./node_modules/playwright-core/browsers.json"],
    "/api/novels/[slug]/refetch-metadata": ["./node_modules/playwright-core/browsers.json"],
    "/api/novels/[slug]/refetch-chapters": ["./node_modules/playwright-core/browsers.json"],
    "/api/novels/[slug]/chapters/[number]": ["./node_modules/playwright-core/browsers.json"],
    "/novels/[slug]/chapters/[number]": ["./node_modules/playwright-core/browsers.json"],
    "/api/surf": ["./node_modules/playwright-core/browsers.json"],
    "/surf/browse": ["./node_modules/playwright-core/browsers.json"],
  },
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // See the planning doc's section 5. /surf/browse is deliberately
  // excluded from Permissions-Policy/frame lockdown considerations that
  // would restrict loading third-party assets -- that route's entire
  // purpose is proxying arbitrary third-party pages (see
  // src/lib/htmlProxy.ts's doc comment); everything else gets the full
  // restrictive set.
  async headers() {
    const commonHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      {
        source: "/((?!surf/browse).*)",
        headers: [...commonHeaders, { key: "X-Frame-Options", value: "DENY" }],
      },
      {
        // Browse mode renders arbitrary third-party markup in an iframe-
        // like proxy view -- still worth the baseline headers, just not
        // the frame lockdown (nothing here embeds *this* app in a frame
        // either way; this only affects whether other sites can frame it).
        source: "/surf/browse",
        headers: commonHeaders,
      },
    ];
  },
};

export default nextConfig;
