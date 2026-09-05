import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { AddBookForm } from "./AddBookForm";
import { DeleteNovelButton } from "@/components/DeleteNovelButton";

// Library/reader pages show live, per-request data (novels/chapters get
// added and translated at runtime) -- never statically prerender these.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [novels, session] = await Promise.all([
    prisma.novel.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chapters: true } } },
    }),
    auth(),
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
          <ul className="flex flex-col gap-2">
            {novels.map((novel) => (
              <li
                key={novel.slug}
                className="flex items-center gap-3 rounded-md border border-neutral-300 p-3 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                {novel.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary hotlinked third-party hosts, not in next.config's image allowlist
                  <img
                    src={novel.coverImageUrl}
                    alt=""
                    className="h-16 w-12 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-16 w-12 shrink-0 rounded bg-neutral-200 dark:bg-neutral-800" />
                )}
                <Link href={`/novels/${novel.slug}`} className="flex-1">
                  <div className="font-medium">{novel.title}</div>
                  <div className="text-sm text-neutral-500">
                    {novel._count.chapters} chương
                  </div>
                </Link>
                {canDelete && (
                  <DeleteNovelButton novelSlug={novel.slug} novelTitle={novel.title} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
