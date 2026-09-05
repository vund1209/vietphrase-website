// Slug generation for Novel.slug. Titles are often Chinese (little to no
// ASCII to slugify), so this can't rely on stripping down to a-z0-9 the
// way an English-title slugifier would -- that would collapse most
// titles to an empty string. Falls back to a short random suffix in
// that case, and the caller (see novels route) is responsible for
// resolving collisions against what's already in the database.
import { randomBytes } from "node:crypto";

export function slugify(title: string): string {
  const ascii = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `truyen-${randomBytes(3).toString("hex")}`;
}

export function withSuffix(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
}

// Slug basis for a newly-embedded novel: derived from the *source URL*,
// not the scraped page title -- a CJK site's <title> tag is often mostly
// non-ASCII, so title-based slugify() can collapse to a stray fragment
// of site branding (e.g. book.sfacg.com's title yielded just "sf").
// Mirrors sangtacviet.com's own embedding convention of
// `<source-site-key>/<book-id>` (confirmed by reviewing their site: their
// internal API calls are literally `...&h=sfacg&bookid=530508...` for
// this same book) -- so a URL like https://book.sfacg.com/Novel/530508/
// becomes "sfacg-530508" here.
export function slugFromSourceUrl(url: string): string {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  const labels = host.split(".");
  // "book.sfacg.com" -> "sfacg" (second-to-last label); a bare host with
  // no subdomain just uses its first label.
  const siteLabel = labels.length > 1 ? labels[labels.length - 2] : labels[0];
  const idSegment = u.pathname.split("/").find((seg) => /^\d+$/.test(seg));
  const base = idSegment ? `${siteLabel}-${idSegment}` : `${siteLabel}-${u.pathname}`;
  return slugify(base);
}
