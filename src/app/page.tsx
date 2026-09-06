import Link from "next/link";
import { Translate } from "@phosphor-icons/react/dist/ssr";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { getReaderId } from "@/lib/readerId";
import { AddBookModal } from "./AddBookModal";
import { NovelCard } from "@/components/NovelCard";
import { NovelGrid } from "@/components/NovelGrid";

// Library/reader pages show live, per-request data (novels/chapters get
// added and translated at runtime) -- never statically prerender these.
export const dynamic = "force-dynamic";

// Homepage only ever shows a short preview -- full browse/search/filter/
// pagination lives at /search (see src/lib/novelBrowse.ts), so this number
// just needs to look good in the grid, not be exhaustive.
const LIBRARY_PREVIEW_SIZE = 8;

export default async function HomePage() {
  const readerId = await getReaderId();
  const [novels, novelCount, session, inProgress] = await Promise.all([
    prisma.novel.findMany({
      orderBy: { createdAt: "desc" },
      take: LIBRARY_PREVIEW_SIZE,
      include: { _count: { select: { chapters: true } } },
    }),
    prisma.novel.count(),
    auth(),
    readerId
      ? prisma.readingProgress.findMany({
          where: { readerId },
          orderBy: { updatedAt: "desc" },
          take: 6,
          include: { novel: { include: { _count: { select: { chapters: true } } } } },
        })
      : Promise.resolve([]),
  ]);
  const canDelete = isAdmin(session?.user?.role);

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold">VietPhrase</h1>
        <p className="text-sm text-muted-foreground">
          Trang đọc truyện dịch Trung → Việt theo kỹ thuật VietPhrase.
        </p>
      </div>

      <Link
        href="/translate"
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <Translate size={20} className="shrink-0 text-accent" weight="duotone" />
        <div>
          <div className="font-medium">Dịch nhanh</div>
          <div className="text-sm text-muted-foreground">
            Dán văn bản tiếng Trung, nhận bản dịch VietPhrase ngay lập tức.
          </div>
        </div>
      </Link>

      {inProgress.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Tiếp tục đọc</h2>
          <NovelGrid>
            {inProgress.map((p) => (
              <NovelCard
                key={p.novel.slug}
                slug={p.novel.slug}
                title={p.novel.title}
                author={p.novel.author}
                coverImageUrl={p.novel.coverImageUrl}
                chapterCount={p.novel._count.chapters}
                canDelete={false}
                href={`/novels/${p.novel.slug}/chapters/${p.chapterNumber}`}
                subtitle={`Chương ${p.chapterNumber}`}
                description={p.novel.description}
              />
            ))}
          </NovelGrid>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="shrink-0 font-display text-xl font-semibold">Thư viện truyện</h2>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/search" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              Xem tất cả ({novelCount}) →
            </Link>
            <AddBookModal />
          </div>
        </div>
        {novels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có truyện nào. Bấm &quot;Thêm truyện&quot; ở trên.
          </p>
        ) : (
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
      </section>
    </main>
  );
}
