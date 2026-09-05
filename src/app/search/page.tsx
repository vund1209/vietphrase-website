import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { NovelCard } from "@/components/NovelCard";
import { NovelGrid } from "@/components/NovelGrid";

// Library/reader pages show live, per-request data -- never statically
// prerender these.
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const [novels, session] = await Promise.all([
    query
      ? prisma.novel.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { originalTitle: { contains: query, mode: "insensitive" } },
              { originalDescription: { contains: query, mode: "insensitive" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { chapters: true } } },
        })
      : Promise.resolve([]),
    auth(),
  ]);
  const canDelete = isAdmin(session?.user?.role);

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">Tìm truyện</h1>
      <form method="GET" action="/search" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Tìm theo tên hoặc mô tả truyện (tiếng Việt hoặc nguyên gốc)…"
          className="flex-1 rounded-md border border-border bg-card px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-md bg-secondary px-4 py-2 text-white transition-opacity hover:opacity-90 dark:text-neutral-900"
        >
          Tìm
        </button>
      </form>

      {query && (
        <p className="text-sm text-muted-foreground">
          {novels.length === 0
            ? `Không tìm thấy truyện nào khớp với "${query}".`
            : `${novels.length} kết quả cho "${query}"`}
        </p>
      )}

      {query && novels.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
          <MagnifyingGlass size={32} />
          <p className="text-sm">Thử một từ khóa khác, hoặc kiểm tra chính tả.</p>
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
            />
          ))}
        </NovelGrid>
      )}
    </main>
  );
}
