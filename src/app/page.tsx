import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { getReaderId } from "@/lib/readerId";
import { AddBookForm } from "./AddBookForm";
import { NovelCard } from "@/components/NovelCard";

// Library/reader pages show live, per-request data (novels/chapters get
// added and translated at runtime) -- never statically prerender these.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const readerId = await getReaderId();
  const [novels, session, inProgress] = await Promise.all([
    prisma.novel.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chapters: true } } },
    }),
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
      <h1 className="text-2xl font-semibold">VietPhrase</h1>
      <p className="text-neutral-600 dark:text-neutral-300">
        Trang đọc truyện dịch Trung → Việt theo kỹ thuật VietPhrase. Xem{" "}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
          docs/ARCHITECTURE.md
        </code>{" "}
        để biết kiến trúc tổng thể.
      </p>

      <Link
        href="/translate"
        className="rounded-md border border-neutral-300 p-4 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        <div className="font-medium">Dịch nhanh</div>
        <div className="text-sm text-neutral-500">
          Dán văn bản tiếng Trung, nhận bản dịch VietPhrase ngay lập tức.
        </div>
      </Link>

      {inProgress.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Tiếp tục đọc</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
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
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Thêm truyện mới</h2>
        <p className="text-sm text-neutral-500">
          Dán URL trang mục lục (danh sách chương) của một truyện trên trang
          web tiếng Trung. Hệ thống dùng bộ trích xuất chung (xem{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            docs/ARCHITECTURE.md
          </code>
          ) — chưa được kiểm chứng trên trang thật nào, có thể thất bại với
          một số trang.
        </p>
        <AddBookForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Thư viện truyện</h2>
        {novels.length === 0 ? (
          <p className="text-sm text-neutral-400">Chưa có truyện nào. Thêm truyện ở trên.</p>
        ) : (
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
      </section>
    </main>
  );
}
