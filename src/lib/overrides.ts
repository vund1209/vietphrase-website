// Fetches override maps from Postgres and builds the in-memory Map
// shapes packages/tokenizer's tokenize() (translations) and
// src/lib/tokenizer.ts's capitalization pass (capStyles) expect, per
// docs/ARCHITECTURE.md "Data split": one query per chapter translation,
// never one query per candidate substring.
import { prisma } from "@/lib/prisma";
import type { NameCapStyle } from "@prisma/client";

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

/** The shared, editor-curated per-novel dictionary every reader sees. */
export async function loadNovelOverrides(novelId: number): Promise<OverrideLayer> {
  const rows = await prisma.name.findMany({
    where: { novelId, isActive: true },
    select: { chineseText: true, vietnameseText: true, capStyle: true },
  });
  return toOverrideLayer(rows);
}

/**
 * One reader's *private* word overrides for one novel -- never shared
 * with other readers unless an editor promotes one into the novel's
 * shared Name dictionary above. See docs/ARCHITECTURE.md "User
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

/**
 * The full override layer for a specific reader viewing a specific
 * novel: the shared dictionary, with that reader's own private
 * overrides layered on top so a personal correction always wins over
 * the shared value (but never the reverse -- another reader's private
 * override never affects what this reader sees).
 */
export async function loadOverridesForUser(
  novelId: number,
  userId: number
): Promise<OverrideLayer> {
  const [shared, personal] = await Promise.all([
    loadNovelOverrides(novelId),
    loadUserWordOverrides(novelId, userId),
  ]);
  return {
    translations: new Map([...shared.translations, ...personal.translations]),
    capStyles: new Map([...shared.capStyles, ...personal.capStyles]),
  };
}
