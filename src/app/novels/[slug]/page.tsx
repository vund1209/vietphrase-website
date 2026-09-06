import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "@phosphor-icons/react/dist/ssr";
import { getNovelBySlug } from "@/lib/novels";
import { auth, isAdmin } from "@/lib/auth";
import { getReadingProgress } from "@/lib/readerId";
import { hanVietOf } from "@/lib/tokenizer";
import { ensureDictionaryDb } from "@/lib/dictionaryDb";
import { CompletionStatusToggle } from "@/components/CompletionStatusToggle";
import { AdminActionsMenu } from "@/components/AdminActionsMenu";

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
  // Belt-and-suspenders alongside instrumentation.ts's register() hook --
  // see src/lib/novels.ts's getOrTranslateChapter for why this exists.
  if (novel.originalTitle) await ensureDictionaryDb();
  const hanViet = novel.originalTitle ? hanVietOf(novel.originalTitle) : null;
  const firstAppear = novel.createdAt.toLocaleDateString("vi-VN");

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-6">
      <div className="flex gap-5">
        {novel.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary hotlinked third-party hosts, not in next.config's image allowlist
          <img
            src={novel.coverImageUrl}
            alt=""
            className="h-48 w-32 shrink-0 rounded-lg object-cover shadow-md"
          />
        )}
        <div className="flex-1">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> Thư viện
          </Link>
          <div className="mt-1 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold">{novel.title}</h1>
              {novel.completionStatus && (
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {COMPLETION_LABEL[novel.completionStatus]}
                </span>
              )}
            </div>
            {canDelete && <AdminActionsMenu novelSlug={novel.slug} novelTitle={novel.title} />}
          </div>
          {canDelete && (
            <CompletionStatusToggle novelSlug={novel.slug} current={novel.completionStatus} />
          )}

          {novel.description && (
            <p className="mt-2 text-sm text-muted-foreground">{novel.description}</p>
          )}

          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm text-muted-foreground">
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
                <dd className="break-all">
                  <a
                    href={novel.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    {novel.sourceUrl}
                  </a>
                </dd>
              </>
            )}
            <dt className="shrink-0">Xuất hiện lần đầu</dt>
            <dd>{firstAppear}</dd>
          </dl>

          <Link
            href={`/novels/${novel.slug}/overrides`}
            className="mt-2 inline-block text-sm underline"
          >
            Từ đã sửa của bạn
          </Link>
        </div>
      </div>

      {novel.chapters.length > 0 && (
        <Link
          href={`/novels/${novel.slug}/chapters/${progress?.chapterNumber ?? 1}`}
          className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3 text-center font-medium text-white transition-opacity hover:opacity-90 dark:text-neutral-900"
        >
          <BookOpen size={18} weight="fill" />
          {progress ? `Tiếp tục đọc — Chương ${progress.chapterNumber}` : "Bắt đầu đọc — Chương 1"}
        </Link>
      )}

      <ul className="flex flex-col divide-y divide-border">
        {novel.chapters.map((chapter) => (
          <li key={chapter.chapterNumber}>
            <Link
              href={`/novels/${novel.slug}/chapters/${chapter.chapterNumber}`}
              className="flex items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-muted"
            >
              <span>
                Chương {chapter.chapterNumber}: {chapter.title}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {progress?.chapterNumber === chapter.chapterNumber && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium">Đang đọc</span>
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
