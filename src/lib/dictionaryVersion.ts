// A cheap, singleton-row counter bumped whenever a *shared* dictionary
// tier changes -- see prisma/schema.prisma's DictionaryVersion and the
// planning doc's section 9. Backs src/lib/overrides.ts's
// loadOverridesForNovelCached: a chapter view compares its cached
// version against the current counter and only re-queries the override
// tables on a mismatch, instead of paying 4 Postgres round-trips
// (global word/name + shared word/name) on every single view.
import { prisma } from "./prisma.ts";

const SINGLETON_ID = 1;

// Short in-memory TTL cache: getDictionaryVersion() is called on every
// single chapter view (via src/lib/overrides.ts's loadOverridesForNovelCached
// and src/lib/novels.ts's chapter-token cache), but the counter itself only
// changes on a rare, deliberate admin action (a promote or global-dictionary
// write) -- without this, every view pays a real Postgres upsert just to
// read a number that's virtually always unchanged. A few seconds of
// possible cross-instance staleness after a bump is an acceptable trade
// for cutting that to near-zero round trips in the common case; bumping
// also clears this same instance's cache immediately (see below), so the
// instance that made the change never serves stale results itself.
const CACHE_TTL_MS = 5000;
let cached: { value: number; expiresAt: number } | null = null;

export async function getDictionaryVersion(): Promise<number> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const row = await prisma.dictionaryVersion.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, version: 1 },
    update: {},
  });
  cached = { value: row.version, expiresAt: now + CACHE_TTL_MS };
  return row.version;
}

/**
 * Called from every route that writes to a shared-tier table: the
 * per-novel promote route (NovelWordOverride/Name) and the global
 * dictionary add/deactivate routes (GlobalWordOverride/GlobalNameOverride).
 * Never called from a personal-save route -- see the schema doc comment.
 */
export async function bumpDictionaryVersion(): Promise<void> {
  const row = await prisma.dictionaryVersion.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, version: 2 },
    update: { version: { increment: 1 } },
  });
  // Invalidate this instance's cache immediately rather than waiting out
  // the TTL -- whichever instance handled the write should never itself
  // serve a stale read right after.
  cached = { value: row.version, expiresAt: Date.now() + CACHE_TTL_MS };
}
