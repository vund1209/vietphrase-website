import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { listAllTags } from "@/lib/tags";
import { NovelCard } from "@/components/NovelCard";
import { NovelGrid } from "@/components/NovelGrid";
import { SearchTagFilter } from "@/components/SearchTagFilter";
import {
  PAGE_SIZE,
  buildNovelOrderBy,
  buildNovelWhere,
  listNovelSources,
  parseNovelBrowseQuery,
} from "@/lib/novelBrowse";

// Library/reader pages show live, per-request data -- never statically
// prerender these.
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "ONGOING", label: "Đang tiến hành" },
  { value: "COMPLETED", label: "Đã hoàn thành" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Mới thêm" },
  { value: "title", label: "Tên A-Z" },
  { value: "chapters", label: "Nhiều chương nhất" },
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    source?: string;
    status?: string;
    author?: string;
    addedBy?: string;
    tags?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const rawParams = await searchParams;
  const browseQuery = parseNovelBrowseQuery(rawParams);
  const where = buildNovelWhere(browseQuery);
  const orderBy = buildNovelOrderBy(browseQuery.sort);

  const [novels, total, sources, session, allTags] = await Promise.all([
    prisma.novel.findMany({
      where,
      orderBy,
      skip: (browseQuery.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { chapters: true } } },
    }),
    prisma.novel.count({ where }),
    listNovelSources(),
    auth(),
    listAllTags(),
  ]);
  const canDelete = isAdmin(session?.user?.role);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedTags = allTags.filter((t) => browseQuery.tags.includes(t.slug));

  function pageHref(page: number): string {
    const params = new URLSearchParams();
    if (browseQuery.q) params.set("q", browseQuery.q);
    if (browseQuery.source) params.set("source", browseQuery.source);
    if (browseQuery.status) params.set("status", browseQuery.status);
    if (browseQuery.author) params.set("author", browseQuery.author);
    if (browseQuery.addedBy) params.set("addedBy", String(browseQuery.addedBy));
    if (browseQuery.tags.length > 0) params.set("tags", browseQuery.tags.join(","));
    if (browseQuery.sort !== "newest") params.set("sort", browseQuery.sort);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Thư viện truyện</h1>
        <p className="text-sm text-muted-foreground">
          Duyệt toàn bộ truyện, hoặc tìm theo tên/mô tả và lọc theo nguồn, trạng thái.
        </p>
      </div>

      <form method="GET" action="/search" className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={browseQuery.q}
            placeholder="Tìm theo tên hoặc mô tả truyện (tiếng Việt hoặc nguyên gốc)…"
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="submit"
            className="cursor-pointer rounded-md bg-secondary px-4 py-2 text-white transition-opacity hover:opacity-90 dark:text-neutral-900"
          >
            Tìm
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <select
            name="source"
            defaultValue={browseQuery.source ?? ""}
            className="rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">Tất cả nguồn</option>
            {sources.map((s) => (
              <option key={s.hostname} value={s.hostname}>
                {s.hostname} ({s.count})
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={browseQuery.status ?? ""}
            className="rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            name="sort"
            defaultValue={browseQuery.sort}
            className="rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="cursor-pointer rounded-md border border-border px-3 py-1.5 hover:bg-muted"
          >
            Lọc
          </button>
        </div>
      </form>

      <SearchTagFilter allTags={allTags} selectedTags={selectedTags} />

      <p className="text-sm text-muted-foreground">
        {total === 0 ? "Không tìm thấy truyện nào." : `${total} truyện`}
      </p>

      {total === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
          <MagnifyingGlass size={32} />
          <p className="text-sm">Thử một từ khóa khác, hoặc bỏ bớt bộ lọc.</p>
        </div>
      )}

      {novels.length > 0 && (
        <NovelGrid>
          {novels.map((novel) => (
            <NovelCard
              key={novel.slug}
              slug={novel.slug}
              title={novel.title}
              author={novel.author}
              coverImageUrl={novel.coverImageUrl}
              chapterCount={novel._count.chapters}
              canDelete={canDelete}
              description={novel.description}
              viewCount={novel.viewCount}
            />
          ))}
        </NovelGrid>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {browseQuery.page > 1 ? (
            <Link href={pageHref(browseQuery.page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
              ← Trước
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Trang {browseQuery.page} / {totalPages}
          </span>
          {browseQuery.page < totalPages ? (
            <Link href={pageHref(browseQuery.page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
              Sau →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </main>
  );
}
