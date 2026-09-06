import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { getNovelBySlug } from "@/lib/novels";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { isOwnerOrAdmin } from "@/lib/isOwnerOrAdmin";
import { hanVietOf } from "@/lib/tokenizer";
import { ensureDictionaryDb } from "@/lib/dictionaryDb";
import { listAllTags } from "@/lib/tags";
import { CompletionStatusToggle } from "@/components/CompletionStatusToggle";
import { AdminActionsMenu } from "@/components/AdminActionsMenu";
import { OwnerNovelActions } from "@/components/OwnerNovelActions";
import { NovelProgressSection } from "@/components/NovelProgressSection";
import { NovelTagsEditor, type NovelTagItem } from "@/components/NovelTagsEditor";

const COMPLETION_LABEL: Record<string, string> = {
  ONGOING: "Đang tiến hành",
  COMPLETED: "Đã hoàn thành",
};

// Library/reader pages show live, per-request data (novels/chapters get
// added and translated at runtime) -- never statically prerender these.
export const dynamic = "force-dynamic";

// Per-novel title/description/og:image instead of the site-wide static
// title in layout.tsx -- real discoverability benefit for a public
// content site (link previews, search engine snippets). See the
// planning doc's section 11.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const novel = await getNovelBySlug(slug);
  if (!novel) return {};

  return {
    title: `${novel.title} | VietPhrase`,
    description: novel.description ?? undefined,
    openGraph: {
      title: novel.title,
      description: novel.description ?? undefined,
      images: novel.coverImageUrl ? [novel.coverImageUrl] : undefined,
    },
  };
}

export default async function NovelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [novel, session, allTags] = await Promise.all([getNovelBySlug(slug), auth(), listAllTags()]);
  if (!novel) notFound();
  const canDelete = isAdmin(session?.user?.role);
  const isSignedIn = Boolean(session?.user);
  const canManage = novel.origin === "USER_CREATED" && isOwnerOrAdmin(novel, session);
  const novelTags: NovelTagItem[] = novel.tags.map((nt) => ({
    tagId: nt.tagId,
    name: nt.tag.name,
    canRemove: isOwnerOrAdmin(nt, session),
  }));
  // Anonymous progress lives entirely client-side (IndexedDB) now -- see
  // NovelProgressSection.tsx and the planning doc's section 4.
  const progress = isSignedIn
    ? await prisma.readingProgress.findUnique({
        where: { userId_novelId: { userId: Number(session!.user.id), novelId: novel.id } },
        select: { chapterNumber: true },
      })
    : null;
  // Belt-and-suspenders alongside instrumentation.ts's register() hook --
  // see src/lib/novels.ts's getOrTranslateChapter for why this exists.
  if (novel.originalTitle) await ensureDictionaryDb();
  const hanViet = novel.originalTitle ? hanVietOf(novel.originalTitle) : null;
  const firstAppear = novel.createdAt.toLocaleDateString("vi-VN");

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-6">
      <div className="flex gap-5">
        {novel.coverImageUrl && (
          // No loading="lazy" here (unlike NovelGrid's cards) -- this is a
          // single always-above-the-fold hero image, where lazy-loading
          // would only delay it for no benefit.
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary hotlinked third-party hosts, not in next.config's image allowlist
          <img
            src={novel.coverImageUrl}
            alt=""
            decoding="async"
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
            {novel.origin === "SCRAPED" && canDelete && (
              <AdminActionsMenu novelSlug={novel.slug} novelTitle={novel.title} />
            )}
          </div>
          {novel.origin === "SCRAPED" && canDelete && (
            <CompletionStatusToggle novelSlug={novel.slug} current={novel.completionStatus} />
          )}
          {canManage && (
            <div className="mt-2">
              <OwnerNovelActions novelSlug={novel.slug} novelTitle={novel.title} />
            </div>
          )}

          {novel.description && (
            <p className="mt-2 text-sm text-muted-foreground">{novel.description}</p>
          )}

          <div className="mt-2">
            <NovelTagsEditor
              novelSlug={novel.slug}
              novelTags={novelTags}
              allTags={allTags}
              isSignedIn={isSignedIn}
            />
          </div>

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
                <dd>
                  <Link
                    href={`/search?author=${encodeURIComponent(novel.author)}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {novel.author}
                  </Link>
                </dd>
              </>
            )}
            {/* Admin-only: a reader's email is account PII, not shown to
                other visitors -- accountability (who embedded this book)
                only needs to be visible to moderators. */}
            {canDelete && novel.addedByUser && (
              <>
                <dt className="shrink-0">Thêm bởi</dt>
                <dd>
                  <Link
                    href={`/search?addedBy=${novel.addedByUser.id}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {novel.addedByUser.email}
                  </Link>
                </dd>
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

      <NovelProgressSection
        novelSlug={novel.slug}
        chapters={novel.chapters}
        serverProgress={progress?.chapterNumber ?? null}
        isSignedIn={isSignedIn}
      />
    </main>
  );
}
