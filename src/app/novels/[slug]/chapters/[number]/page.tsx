import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { auth, isEditorOrAdmin, isAdmin } from "@/lib/auth";
import { isOwnerOrAdmin } from "@/lib/isOwnerOrAdmin";
import {
  ChapterNotFoundError,
  ScrapeFailedError,
  getNovelBySlug,
  getOrTranslateChapter,
} from "@/lib/novels";
import { ChapterReader } from "@/components/ChapterReader";
import { ReadingProgressPing } from "@/components/ReadingProgressPing";
import { RefetchChapterButton } from "@/components/RefetchChapterButton";
import { ChapterTocPanel } from "@/components/ChapterTocPanel";
import { OwnerChapterActions } from "@/components/OwnerChapterActions";

// Library/reader pages show live, per-request data (novels/chapters get
// added and translated at runtime) -- never statically prerender these.
export const dynamic = "force-dynamic";

// See the novel page's generateMetadata -- same reasoning. Deliberately
// title/novel-level only, never chapter body text, in the description.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}): Promise<Metadata> {
  const { slug, number } = await params;
  const novel = await getNovelBySlug(slug);
  if (!novel) return {};
  const chapter = novel.chapters.find((c) => String(c.chapterNumber) === number);

  return {
    title: chapter
      ? `Chương ${chapter.chapterNumber}: ${chapter.title} | ${novel.title}`
      : `${novel.title} | VietPhrase`,
    description: `Đọc ${novel.title} (${novel.chapters.length} chương) -- dịch Trung → Việt theo kỹ thuật VietPhrase.`,
  };
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const chapterNumber = Number(number);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) notFound();

  const [novel, session] = await Promise.all([getNovelBySlug(slug), auth()]);
  if (!novel) notFound();

  let result: Awaited<ReturnType<typeof getOrTranslateChapter>>;
  try {
    // Passes the already-fetched novel through -- getOrTranslateChapter
    // would otherwise re-fetch this exact same row itself. See its own
    // doc comment.
    result = await getOrTranslateChapter(slug, chapterNumber, novel);
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
  const canManage = novel.origin === "USER_CREATED" && isOwnerOrAdmin(novel, session);

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
      <ReadingProgressPing
        novelSlug={slug}
        novelTitle={novel.title}
        chapterNumber={chapterNumber}
        isSignedIn={Boolean(session?.user)}
      />
      <div className="sticky top-0 z-10 -mx-6 flex items-center justify-between bg-background/90 px-6 py-2 text-sm text-muted-foreground backdrop-blur-sm">
        <Link href={`/novels/${slug}`} className="hover:text-foreground hover:underline">
          ← {novel.title}
        </Link>
        <div className="flex items-center gap-1">
          <span>
            Chương {chapterNumber} / {totalChapters}
          </span>
          <ChapterTocPanel novelSlug={slug} currentChapter={chapterNumber} chapters={novel.chapters} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold">
          Chương {chapterNumber}: {result.chapter.title}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {canManage && (
            <OwnerChapterActions
              novelSlug={slug}
              chapterNumber={chapterNumber}
              initialTitle={result.chapter.title}
              initialRawText={result.plainText ?? ""}
            />
          )}
          {isAdmin(session?.user?.role) && novel.origin === "SCRAPED" && (
            <RefetchChapterButton novelSlug={slug} chapterNumber={chapterNumber} />
          )}
        </div>
      </div>
      {result.tokens ? (
        <ChapterReader
          key={chapterNumber}
          novelSlug={slug}
          chapterNumber={chapterNumber}
          lines={result.tokens}
          canPromote={isEditorOrAdmin(session?.user?.role)}
          canApplyGlobally={isAdmin(session?.user?.role)}
          isSignedIn={Boolean(session?.user)}
        />
      ) : (
        <article className="prose-reading text-lg">
          {(result.plainText ?? "").split("\n").map((line, i) => (
            <p key={i} className="mb-4">
              {line || " "}
            </p>
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
