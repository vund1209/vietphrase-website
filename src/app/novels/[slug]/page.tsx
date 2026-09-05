import Link from "next/link";
import { notFound } from "next/navigation";
import { getNovelBySlug } from "@/lib/novels";
import { auth, isAdmin } from "@/lib/auth";
import { getReadingProgress } from "@/lib/readerId";
import { hanVietOf } from "@/lib/tokenizer";
import { DeleteNovelButton } from "@/components/DeleteNovelButton";
import { CompletionStatusToggle } from "@/components/CompletionStatusToggle";

const COMPLETION_LABEL: Record<string, string> = {
  ONGOING: "Đang tiến hành",
  COMPLETED: "Đã hoàn thành",
};

// Library/reader pages show live, per-request data (novels/chapters get
// added and translated at runtime) -- never statically prerender these.
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chưa tải",
  SCRAPED: "Sẵn sàng",
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
  const progress = await getReadingProgress(novel.id);
  const hanViet = novel.originalTitle ? hanVietOf(novel.originalTitle) : null;
  const firstAppear = novel.createdAt.toLocaleDateString("vi-VN");

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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{novel.title}</h1>
            {novel.completionStatus && (
              <span className="shrink-0 rounded-md bg-neutral-200 px-2 py-0.5 text-xs dark:bg-neutral-800">
                {COMPLETION_LABEL[novel.completionStatus]}
              </span>
            )}
          </div>
          {canDelete && (
            <CompletionStatusToggle novelSlug={novel.slug} current={novel.completionStatus} />
          )}

          {novel.description && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              {novel.description}
            </p>
          )}

          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm text-neutral-500">
            {novel.originalTitle && novel.originalTitle !== novel.title && (
              <>
                <dt className="shrink-0">Nguyên tác</dt>
                <dd>{novel.originalTitle}</dd>
              </>
            )}
            {hanViet && (
              <>
                <dt className="shrink-0">Hán Việt</dt>
                <dd>{hanViet}</dd>
              </>
            )}
            {novel.author && (
              <>
                <dt className="shrink-0">Tác giả</dt>
                <dd>{novel.author}</dd>
              </>
            )}
            {novel.sourceUrl && (
              <>
                <dt className="shrink-0">Nguồn</dt>
                <dd className="break-all">{novel.sourceUrl}</dd>
              </>
            )}
            <dt className="shrink-0">Xuất hiện lần đầu</dt>
            <dd>{firstAppear}</dd>
          </dl>

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

      {novel.chapters.length > 0 && (
        <Link
          href={`/novels/${novel.slug}/chapters/${progress?.chapterNumber ?? 1}`}
          className="rounded-md bg-neutral-900 px-4 py-3 text-center font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          {progress ? `Tiếp tục đọc — Chương ${progress.chapterNumber}` : "Bắt đầu đọc — Chương 1"}
        </Link>
      )}

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
              <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-400">
                {progress?.chapterNumber === chapter.chapterNumber && (
                  <span className="rounded-md bg-neutral-200 px-1.5 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    Đang đọc
                  </span>
                )}
                {STATUS_LABEL[chapter.status] ?? chapter.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
