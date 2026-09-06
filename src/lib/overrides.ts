// Fetches override maps from Postgres and builds the in-memory Map
// shapes packages/tokenizer's tokenize() (translations) and
// src/lib/tokenizer.ts's capitalization pass (capStyles) expect, per
// docs/ARCHITECTURE.md "Data split": one query per chapter translation,
// never one query per candidate substring.
//
// Two tracks, three tiers each (see prisma/schema.prisma): a PHRASE
// correction ("this verb phrase reads better as X") and a proper-noun
// override ("this character's name is X") write to separate tables per
// tier (UserWordOverride/UserNameOverride, NovelWordOverride/Name,
// GlobalWordOverride/GlobalNameOverride) so the promotion/management UI
// can tell them apart -- but translation itself never cared about the
// distinction, so every tier-level loader below merges both tracks
// before the cross-tier merge, keeping the final priority order exactly
// what it was before the split (global < shared < personal).
import { prisma } from "@/lib/prisma";
import type { NameCapStyle } from "@prisma/client";
import { getDictionaryVersion } from "@/lib/dictionaryVersion";

// Bounds for a user-submitted override's chineseText/vietnameseText,
// shared by both write routes (personal save and shared-dictionary
// promote). A span can never legitimately cross a paragraph break
// (tokenLines is already split per "\n"), and these caps just keep
// runaway input (and the tokenizer's override-length-driven scan window)
// bounded -- see docs/VIETPHRASE_CORE.md "Open decisions".
export const MAX_OVERRIDE_PHRASE_LENGTH = 60;
export const MAX_TRANSLATION_LENGTH = 200;
export const MAX_TRANSLATION_SEGMENTS = 8;

const CAP_STYLES: NameCapStyle[] = ["NONE", "FIRST_LETTER", "ALL_WORDS"];

export function validateOverridePair(
  chineseText: string,
  vietnameseText: string
): string | null {
  if (!chineseText || !vietnameseText) {
    return "chineseText and vietnameseText are both required";
  }
  if (chineseText.includes("\n")) {
    return "chineseText cannot span multiple lines";
  }
  if (chineseText.length > MAX_OVERRIDE_PHRASE_LENGTH) {
    return `chineseText must be at most ${MAX_OVERRIDE_PHRASE_LENGTH} characters`;
  }
  if (vietnameseText.length > MAX_TRANSLATION_LENGTH) {
    return `vietnameseText must be at most ${MAX_TRANSLATION_LENGTH} characters`;
  }
  if (vietnameseText.split("/").length > MAX_TRANSLATION_SEGMENTS) {
    return `vietnameseText can have at most ${MAX_TRANSLATION_SEGMENTS} "/"-separated options`;
  }
  return null;
}

export function validateCapStyle(value: unknown): value is NameCapStyle {
  return CAP_STYLES.includes(value as NameCapStyle);
}

/** Which table a tier's write goes to -- see the file header. */
export type OverrideTrack = "phrase" | "name";

export function validateTrack(value: unknown): value is OverrideTrack {
  return value === "phrase" || value === "name";
}

export interface OverrideLayer {
  /** chineseText -> raw vietnameseText ("a/b/c"), what the tokenizer's overrides param expects. */
  translations: Map<string, string>;
  /** chineseText -> capitalization style, for src/lib/tokenizer.ts's applyCapStyle. */
  capStyles: Map<string, NameCapStyle>;
}

function toOverrideLayer(rows: { chineseText: string; vietnameseText: string; capStyle: NameCapStyle }[]): OverrideLayer {
  return {
    translations: new Map(rows.map((r) => [r.chineseText, r.vietnameseText])),
    capStyles: new Map(rows.map((r) => [r.chineseText, r.capStyle])),
  };
}

/** Merges override layers in priority order -- later layers win on a shared key. */
function mergeLayers(...layers: OverrideLayer[]): OverrideLayer {
  return {
    translations: new Map(layers.flatMap((l) => [...l.translations])),
    capStyles: new Map(layers.flatMap((l) => [...l.capStyles])),
  };
}

// --- Per-novel shared tier -------------------------------------------

/** Per-novel shared tier, NAME track (prisma.name -- see schema.prisma). */
export async function loadNovelNameOverrides(novelId: number): Promise<OverrideLayer> {
  const rows = await prisma.name.findMany({
    where: { novelId, isActive: true },
    select: { chineseText: true, vietnameseText: true, capStyle: true },
  });
  return toOverrideLayer(rows);
}

/** Per-novel shared tier, PHRASE track (prisma.novelWordOverride). */
export async function loadNovelWordOverrides(novelId: number): Promise<OverrideLayer> {
  const rows = await prisma.novelWordOverride.findMany({
    where: { novelId, isActive: true },
    select: { chineseText: true, vietnameseText: true, capStyle: true },
  });
  return toOverrideLayer(rows);
}

/** The full per-novel shared dictionary every reader sees -- both tracks merged. */
export async function loadNovelOverrides(novelId: number): Promise<OverrideLayer> {
  const [phrase, name] = await Promise.all([
    loadNovelWordOverrides(novelId),
    loadNovelNameOverrides(novelId),
  ]);
  return mergeLayers(phrase, name);
}

// --- Global tier -------------------------------------------------------

/**
 * Global tier, PHRASE track (prisma.globalWordOverride) -- admin-curated
 * corrections that apply to every novel. See prisma/schema.prisma.
 */
export async function loadGlobalWordOverrides(): Promise<OverrideLayer> {
  const rows = await prisma.globalWordOverride.findMany({
    where: { isActive: true },
    select: { chineseText: true, vietnameseText: true, capStyle: true },
  });
  return toOverrideLayer(rows);
}

/** Global tier, NAME track (prisma.globalNameOverride). */
export async function loadGlobalNameOverrides(): Promise<OverrideLayer> {
  const rows = await prisma.globalNameOverride.findMany({
    where: { isActive: true },
    select: { chineseText: true, vietnameseText: true, capStyle: true },
  });
  return toOverrideLayer(rows);
}

/** The full global correction layer -- both tracks merged. */
export async function loadGlobalOverrides(): Promise<OverrideLayer> {
  const [phrase, name] = await Promise.all([loadGlobalWordOverrides(), loadGlobalNameOverrides()]);
  return mergeLayers(phrase, name);
}

// --- Personal tier -------------------------------------------------------

/**
 * Personal tier, PHRASE track (prisma.userWordOverride) -- one reader's
 * private phrase overrides for one novel. See docs/ARCHITECTURE.md "User
 * management and per-word overrides".
 */
export async function loadUserWordOverrides(
  novelId: number,
  userId: number
): Promise<OverrideLayer> {
  const rows = await prisma.userWordOverride.findMany({
    where: { novelId, userId },
    select: { chineseText: true, vietnameseText: true, capStyle: true },
  });
  return toOverrideLayer(rows);
}

/** Personal tier, NAME track (prisma.userNameOverride). */
export async function loadUserNameOverrides(
  novelId: number,
  userId: number
): Promise<OverrideLayer> {
  const rows = await prisma.userNameOverride.findMany({
    where: { novelId, userId },
    select: { chineseText: true, vietnameseText: true, capStyle: true },
  });
  return toOverrideLayer(rows);
}

/** The full personal override layer for one reader/novel -- both tracks merged. */
export async function loadUserOverrides(novelId: number, userId: number): Promise<OverrideLayer> {
  const [phrase, name] = await Promise.all([
    loadUserWordOverrides(novelId, userId),
    loadUserNameOverrides(novelId, userId),
  ]);
  return mergeLayers(phrase, name);
}

// --- Cross-tier merges (translation priority: global < shared < personal) --

/**
 * The full override layer for anonymous/no-personal-override reading:
 * global corrections, with the novel's own shared dictionary winning on
 * a shared key (more specific beats less specific).
 */
export async function loadOverridesForNovel(novelId: number): Promise<OverrideLayer> {
  const [global, shared] = await Promise.all([loadGlobalOverrides(), loadNovelOverrides(novelId)]);
  return mergeLayers(global, shared);
}

/**
 * The full override layer for a specific reader viewing a specific
 * novel: global corrections, then the novel's shared dictionary, then
 * that reader's own private overrides layered on top so a personal
 * correction always wins (but never the reverse -- another reader's
 * private override never affects what this reader sees).
 */
export async function loadOverridesForUser(
  novelId: number,
  userId: number
): Promise<OverrideLayer> {
  const [globalAndShared, personal] = await Promise.all([
    loadOverridesForNovel(novelId),
    loadUserOverrides(novelId, userId),
  ]);
  return mergeLayers(globalAndShared, personal);
}

// --- Process-local cache for the hot chapter-read path ------------------

// novelId -> the layer as of a given dictionary version. Only ever read
// from src/lib/novels.ts's tokenizeChapter (every chapter view, by far
// the hottest caller of loadOverridesForNovel) -- the promote/global
// write routes call the uncached loadOverridesForNovel directly, since
// they need the just-written value immediately and are low-frequency
// admin actions, not the thing this is optimizing for. See the planning
// doc's section 9: avoids repeating 4 Postgres round-trips (global word/
// name + shared word/name) on every single chapter view when nothing in
// the shared dictionary has changed since the last one.
//
// Deliberately process-local, not a shared/durable cache: on Vercel this
// only helps a warm serverless instance's *repeat* traffic within its
// own lifetime -- a cold start or a different instance still pays the
// full query cost once. That's fine; this is a "skip the repeat work in
// the common case" optimization, not a correctness or durability
// guarantee, and the version-counter check means it can never serve a
// stale result even when it does hit.
const novelOverrideCache = new Map<number, { version: number; layer: OverrideLayer }>();

export async function loadOverridesForNovelCached(novelId: number): Promise<OverrideLayer> {
  const version = await getDictionaryVersion();
  const cached = novelOverrideCache.get(novelId);
  if (cached && cached.version === version) return cached.layer;

  const layer = await loadOverridesForNovel(novelId);
  novelOverrideCache.set(novelId, { version, layer });
  return layer;
}
