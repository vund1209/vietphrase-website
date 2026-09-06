// Shared preset-tag helpers -- see prisma/schema.prisma's Tag/NovelTag
// models and the planning doc's section 13. The full Tag list is small
// and bounded (tens, not thousands, of rows -- see scripts/seed-tags.mjs),
// so callers load it once and filter client-side rather than round-tripping
// per keystroke.
import { prisma } from "@/lib/prisma";

export interface TagOption {
  id: number;
  name: string;
  slug: string;
  category: string | null;
}

export function listAllTags(): Promise<TagOption[]> {
  return prisma.tag.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, category: true },
  });
}
