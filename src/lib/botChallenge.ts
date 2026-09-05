// Pure bot-challenge detection, split out of browserFetch.ts so it can be
// imported without pulling in playwright-core (see scraper.ts's fetchHtml,
// which needs this check on every request but must only load
// playwright-core -- a heavy dependency that isn't reliably traceable into
// every Vercel serverless function -- on the rare request that actually
// needs the headless-browser fallback).
const BOT_CHALLENGE_RE =
  /just a moment|attention required|cf-browser-verification|__cf_chl_|checking your browser|access denied|enable javascript and cookies/i;

export function looksLikeBotChallenge(status: number, html: string): boolean {
  if (status === 403 || status === 503) return true;
  return BOT_CHALLENGE_RE.test(html.slice(0, 4000));
}
