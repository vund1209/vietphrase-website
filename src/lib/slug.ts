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
