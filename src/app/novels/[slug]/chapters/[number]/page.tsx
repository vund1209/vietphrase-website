import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, isEditorOrAdmin } from "@/lib/auth";
import {
  ChapterNotFoundError,
  ScrapeFailedError,
  getNovelBySlug,
  getOrTranslateChapter,
} from "@/lib/novels";
import { ChapterReader } from "@/components/ChapterReader";
import { ReadingProgressPing } from "@/components/ReadingProgressPing";

// Library/reader pages show live, per-request data (novels/chapters get
// added and translated at runtime) -- never statically prerender these.
export const dynamic = "force-dynamic";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const chapterNumber = Number(number);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) notFound();

  const novel = await getNovelBySlug(slug);
  if (!novel) notFound();

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : undefined;

  let result: Awaited<ReturnType<typeof getOrTranslateChapter>>;
  try {
    result = await getOrTranslateChapter(slug, chapterNumber, userId);
  } catch (err) {
    if (err instanceof ChapterNotFoundError) notFound();
    if (!(err instanceof ScrapeFailedError)) throw err;
    return (
      <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
        <Link href={`/novels/${slug}`} className="text-sm text-neutral-500 hover:underline">
          ← {novel.title}
        </Link>
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Không thể lấy nội dung chương này: {err.message}
        </div>
      </main>
    );
  }

  const totalChapters = novel.chapters.length;
  const hasPrev = chapterNumber > 1;
  const hasNext = chapterNumber < totalChapters;

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
      <ReadingProgressPing novelSlug={slug} chapterNumber={chapterNumber} />
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <Link href={`/novels/${slug}`} className="hover:underline">
          ← {novel.title}
        </Link>
        <span>
          Chương {chapterNumber} / {totalChapters}
        </span>
      </div>

      <h1 className="text-xl font-semibold">
        Chương {chapterNumber}: {result.chapter.title}
      </h1>
      {result.tokens ? (
        <ChapterReader
          novelSlug={slug}
          lines={result.tokens}
          canPromote={isEditorOrAdmin(session?.user?.role)}
        />
      ) : (
        <article className="prose-reading text-lg">
          {(result.translatedText ?? "").split("\n").map((line, i) => (
            <p key={i}>{line || " "}</p>
          ))}
        </article>
      )}

      <div className="flex items-center justify-between border-t border-neutral-200 pt-4 dark:border-neutral-800">
        {hasPrev ? (
          <Link
            href={`/novels/${slug}/chapters/${chapterNumber - 1}`}
            className="text-sm hover:underline"
          >
            ← Chương trước
          </Link>
        ) : (
          <span />
        )}
        {hasNext ? (
          <Link
            href={`/novels/${slug}/chapters/${chapterNumber + 1}`}
            className="text-sm hover:underline"
          >
            Chương sau →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </main>
  );
}
