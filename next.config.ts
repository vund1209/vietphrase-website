import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core (headless-browser fallback for bot-protected sites --
  // see src/lib/browserFetch.ts) has to stay a real runtime require, not
  // get bundled: it dynamically loads a native driver binary in a way
  // static bundling can't follow. Without this, Vercel's build was
  // observed failing to trace playwright-core's non-JS `browsers.json`
  // into the deployed function at all -- and since src/lib/scraper.ts
  // imports browserFetch.ts at module scope, that missing-file error
  // broke *every* page that transitively imports scraper.ts (via
  // src/lib/novels.ts), not just the routes that actually use the
  // fallback. serverExternalPackages fixes the require; the explicit
  // outputFileTracingIncludes below is belt-and-suspenders to make sure
  // browsers.json specifically gets traced into every route's function.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/playwright-core/browsers.json"],
  },
};

export default nextConfig;
