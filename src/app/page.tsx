import Link from "next/link";
import { CaretRight, Translate } from "@phosphor-icons/react/dist/ssr";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { AddBookModal } from "./AddBookModal";
import { NovelCard } from "@/components/NovelCard";
import { NovelGrid } from "@/components/NovelGrid";
import { AnonymousContinueReading } from "@/components/AnonymousContinueReading";

// Library/reader pages show live, per-request data (novels/chapters get
// added and translated at runtime) -- never statically prerender these.
export const dynamic = "force-dynamic";

// Homepage only ever shows a short preview -- full browse/search/filter/
// pagination lives at /search (see src/lib/novelBrowse.ts), so this number
// just needs to look good in the grid, not be exhaustive.
const LIBRARY_PREVIEW_SIZE = 8;

export default async function HomePage() {
  const [novels, novelCount, session] = await Promise.all([
    prisma.novel.findMany({
      orderBy: { createdAt: "desc" },
      take: LIBRARY_PREVIEW_SIZE,
      include: { _count: { select: { chapters: true } } },
    }),
    prisma.novel.count(),
    auth(),
  ]);
  const canDelete = isAdmin(session?.user?.role);
  // Anonymous progress lives entirely client-side (IndexedDB) now -- see
  // AnonymousContinueReading.tsx and the planning doc's section 4.
  const inProgress = session?.user
    ? await prisma.readingProgress.findMany({
        where: { userId: Number(session.user.id) },
        orderBy: { updatedAt: "desc" },
        take: 6,
        include: { novel: { select: { slug: true, title: true } } },
      })
    : [];

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

      {session?.user ? (
        inProgress.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold">Tiếp tục đọc</h2>
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
              {inProgress.map((p) => (
                <Link
                  key={p.novel.slug}
                  href={`/novels/${p.novel.slug}/chapters/${p.chapterNumber}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted"
                >
                  <span className="truncate font-medium">{p.novel.title}</span>
                  <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                    Chương {p.chapterNumber}
                    <CaretRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )
      ) : (
        <AnonymousContinueReading />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="shrink-0 font-display text-xl font-semibold">Thư viện truyện</h2>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/search" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              Xem tất cả ({novelCount}) →
            </Link>
            <AddBookModal isSignedIn={Boolean(session?.user)} />
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
                viewCount={novel.viewCount}
              />
            ))}
          </NovelGrid>
        )}
      </section>
    </main>
  );
}
