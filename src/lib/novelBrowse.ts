// Shared query-building layer for browsing/searching the library
// (src/app/search/page.tsx and, for a short preview, src/app/page.tsx) --
// centralized so a future filter is one new field + one new where-clause,
// not a page rewrite. See docs/PLANNED_FEATURES.md-style reasoning: the
// homepage's "needs sort/filter" ask and the search page's "filter by
// embed source" ask are the same underlying need.
import { Prisma, NovelCompletionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PAGE_SIZE = 24;

export type NovelSort = "newest" | "title" | "chapters";

export interface NovelBrowseQuery {
  q: string;
  source: string | null;
  status: NovelCompletionStatus | null;
  sort: NovelSort;
  page: number;
}

const VALID_SORTS: NovelSort[] = ["newest", "title", "chapters"];
const VALID_STATUSES = Object.values(NovelCompletionStatus);

export function parseNovelBrowseQuery(searchParams: {
  q?: string;
  source?: string;
  status?: string;
  sort?: string;
  page?: string;
}): NovelBrowseQuery {
  const sort = VALID_SORTS.includes(searchParams.sort as NovelSort)
    ? (searchParams.sort as NovelSort)
    : "newest";
  const status = VALID_STATUSES.includes(searchParams.status as NovelCompletionStatus)
    ? (searchParams.status as NovelCompletionStatus)
    : null;
  const page = Math.max(1, Number(searchParams.page) || 1);

  return {
    q: searchParams.q?.trim() ?? "",
    source: searchParams.source?.trim() || null,
    status,
    sort,
    page,
  };
}

export function buildNovelWhere({ q, source, status }: NovelBrowseQuery): Prisma.NovelWhereInput {
  const clauses: Prisma.NovelWhereInput[] = [];

  if (q) {
    clauses.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { originalTitle: { contains: q, mode: "insensitive" } },
        { originalDescription: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (source) {
    // sourceUrl stores the full URL; matching "https://<hostname>/" as a
    // prefix is enough to select that host without needing a dedicated
    // column -- see listNovelSources() below for where the hostname list
    // (and this same derivation) comes from.
    clauses.push({ sourceUrl: { startsWith: `https://${source}/` } });
  }
  if (status) {
    clauses.push({ completionStatus: status });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

export function buildNovelOrderBy(sort: NovelSort): Prisma.NovelOrderByWithRelationInput {
  switch (sort) {
    case "title":
      return { title: "asc" };
    case "chapters":
      return { chapters: { _count: "desc" } };
    case "newest":
    default:
      return { createdAt: "desc" };
  }
}

export interface NovelSourceOption {
  hostname: string;
  count: number;
}

/**
 * Derives the "source" filter's options from whatever `sourceUrl`s are
 * already in the library -- no hardcoded site list, so a newly-added
 * per-site adapter (src/lib/extract/adapters.ts) shows up here the moment
 * its first book is embedded, with no change needed in this function.
 */
export async function listNovelSources(): Promise<NovelSourceOption[]> {
  const novels = await prisma.novel.findMany({
    where: { sourceUrl: { not: null } },
    select: { sourceUrl: true },
  });

  const counts = new Map<string, number>();
  for (const { sourceUrl } of novels) {
    if (!sourceUrl) continue;
    let hostname: string;
    try {
      hostname = new URL(sourceUrl).hostname;
    } catch {
      continue;
    }
    counts.set(hostname, (counts.get(hostname) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([hostname, count]) => ({ hostname, count }))
    .sort((a, b) => a.hostname.localeCompare(b.hostname));
}
