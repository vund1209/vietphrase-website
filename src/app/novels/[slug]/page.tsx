import Link from "next/link";
import { notFound } from "next/navigation";
import { getNovelBySlug } from "@/lib/novels";
import { auth, isAdmin } from "@/lib/auth";
import { DeleteNovelButton } from "@/components/DeleteNovelButton";

// Library/reader pages show live, per-request data (novels/chapters get
// added and translated at runtime) -- never statically prerender these.
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chưa dịch",
  SCRAPED: "Đã lấy nội dung",
  TRANSLATED: "Đã dịch",
  ERROR: "Lỗi",
};

export default async function NovelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [novel, session] = await Promise.all([getNovelBySlug(slug), auth()]);
  if (!novel) notFound();
  const canDelete = isAdmin(session?.user?.role);

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-6">
      <div className="flex gap-4">
        {novel.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary hotlinked third-party hosts, not in next.config's image allowlist
          <img
            src={novel.coverImageUrl}
            alt=""
            className="h-40 w-28 shrink-0 rounded object-cover"
          />
        )}
        <div className="flex-1">
          <Link href="/" className="text-sm text-neutral-500 hover:underline">
            ← Thư viện
          </Link>
          <h1 className="text-2xl font-semibold">{novel.title}</h1>
          {novel.originalTitle && novel.originalTitle !== novel.title && (
            <p className="text-sm text-neutral-500">Nguyên tác: {novel.originalTitle}</p>
          )}
          {novel.author && (
            <p className="text-sm text-neutral-500">Tác giả: {novel.author}</p>
          )}
          {novel.description && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              {novel.description}
            </p>
          )}
          {novel.sourceUrl && (
            <p className="text-sm text-neutral-500 break-all">
              Nguồn: {novel.sourceUrl}
            </p>
          )}
          <div className="mt-2 flex items-center gap-4">
            <Link href={`/novels/${novel.slug}/overrides`} className="text-sm underline">
              Từ đã sửa của bạn
            </Link>
            {canDelete && (
              <DeleteNovelButton novelSlug={novel.slug} novelTitle={novel.title} redirectTo="/" />
            )}
          </div>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {novel.chapters.map((chapter) => (
          <li key={chapter.chapterNumber}>
            <Link
              href={`/novels/${novel.slug}/chapters/${chapter.chapterNumber}`}
              className="flex items-center justify-between gap-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <span>
                Chương {chapter.chapterNumber}: {chapter.title}
              </span>
              <span className="shrink-0 text-xs text-neutral-400">
                {STATUS_LABEL[chapter.status] ?? chapter.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
