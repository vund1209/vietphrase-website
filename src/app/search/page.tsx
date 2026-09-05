import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { NovelCard } from "@/components/NovelCard";

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
      <h1 className="text-2xl font-semibold">Tìm truyện</h1>
      <form method="GET" action="/search" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Tìm theo tên hoặc mô tả truyện (tiếng Việt hoặc nguyên gốc)…"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Tìm
        </button>
      </form>

      {query && (
        <p className="text-sm text-neutral-500">
          {novels.length === 0
            ? `Không tìm thấy truyện nào khớp với "${query}".`
            : `${novels.length} kết quả cho "${query}"`}
        </p>
      )}

      {novels.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
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
        </div>
      )}
    </main>
  );
}
