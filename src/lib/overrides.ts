// Fetches override maps from Postgres and builds the in-memory Map
// shape packages/tokenizer's tokenize() expects, per docs/ARCHITECTURE.md
// "Data split": one query per chapter translation, never one query per
// candidate substring.
import { prisma } from "@/lib/prisma";

/** The shared, editor-curated per-novel dictionary every reader sees. */
export async function loadNovelOverrides(novelId: number): Promise<Map<string, string>> {
  const rows = await prisma.name.findMany({
    where: { novelId, isActive: true },
    select: { chineseText: true, vietnameseText: true },
  });
  return new Map(rows.map((r) => [r.chineseText, r.vietnameseText]));
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
): Promise<Map<string, string>> {
  const rows = await prisma.userWordOverride.findMany({
    where: { novelId, userId },
    select: { chineseText: true, vietnameseText: true },
  });
  return new Map(rows.map((r) => [r.chineseText, r.vietnameseText]));
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
): Promise<Map<string, string>> {
  const [shared, personal] = await Promise.all([
    loadNovelOverrides(novelId),
    loadUserWordOverrides(novelId, userId),
  ]);
  return new Map([...shared, ...personal]);
}
