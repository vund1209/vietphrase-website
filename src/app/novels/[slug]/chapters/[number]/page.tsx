import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { auth, isEditorOrAdmin, isAdmin } from "@/lib/auth";
import {
  ChapterNotFoundError,
  ScrapeFailedError,
  getNovelBySlug,
  getOrTranslateChapter,
} from "@/lib/novels";
import { ChapterReader } from "@/components/ChapterReader";
import { ReadingProgressPing } from "@/components/ReadingProgressPing";
import { RefetchChapterButton } from "@/components/RefetchChapterButton";

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
        <Link href={`/novels/${slug}`} className="text-sm text-muted-foreground hover:underline">
          ← {novel.title}
        </Link>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
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
      <div className="sticky top-0 z-10 -mx-6 flex items-center justify-between bg-background/90 px-6 py-2 text-sm text-muted-foreground backdrop-blur-sm">
        <Link href={`/novels/${slug}`} className="hover:text-foreground hover:underline">
          ← {novel.title}
        </Link>
        <span>
          Chương {chapterNumber} / {totalChapters}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold">
          Chương {chapterNumber}: {result.chapter.title}
        </h1>
        {isAdmin(session?.user?.role) && (
          <RefetchChapterButton novelSlug={slug} chapterNumber={chapterNumber} />
        )}
      </div>
      {result.tokens ? (
        <ChapterReader
          novelSlug={slug}
          lines={result.tokens}
          canPromote={isEditorOrAdmin(session?.user?.role)}
          canApplyGlobally={isAdmin(session?.user?.role)}
        />
      ) : (
        <article className="prose-reading text-lg">
          {(result.translatedText ?? "").split("\n").map((line, i) => (
            <p key={i}>{line || " "}</p>
          ))}
        </article>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        {hasPrev ? (
          <Link
            href={`/novels/${slug}/chapters/${chapterNumber - 1}`}
            className="flex items-center gap-1 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <CaretLeft size={14} /> Chương trước
          </Link>
        ) : (
          <span />
        )}
        {hasNext ? (
          <Link
            href={`/novels/${slug}/chapters/${chapterNumber + 1}`}
            className="flex items-center gap-1 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            Chương sau <CaretRight size={14} />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </main>
  );
}
