// Shared error type for the "headless browser needed but not allowed"
// case -- used by both src/lib/scraper.ts and src/lib/browserFetch.ts.
// Its own tiny module (no dependencies) so either file can import it
// without creating a circular import between them (scraper.ts already
// dynamically imports browserFetch.ts).
export class HeadlessBrowserRequiredError extends Error {}
