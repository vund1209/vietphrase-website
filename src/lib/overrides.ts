// Fetches per-novel Name overrides from Postgres and builds the in-
// memory Map that packages/tokenizer's tokenize() expects, per
// docs/ARCHITECTURE.md "Data split": one query per chapter translation,
// never one query per candidate substring.
import { prisma } from "@/lib/prisma";

export async function loadNovelOverrides(novelId: number): Promise<Map<string, string>> {
  const rows = await prisma.name.findMany({
    where: { novelId, isActive: true },
    select: { chineseText: true, vietnameseText: true },
  });
  return new Map(rows.map((r) => [r.chineseText, r.vietnameseText]));
}
