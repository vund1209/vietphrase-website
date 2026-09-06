import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, BookOpen, Translate } from "@phosphor-icons/react/dist/ssr";
import { fetchRawHtml } from "@/lib/browserFetch";
import { HeadlessBrowserRequiredError } from "@/lib/fetchErrors";
import { buildProxyPage } from "@/lib/htmlProxy";
import { isSafePublicUrl } from "@/lib/urlSafety";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/adminActivity";
import { tryGetBrowseChapterList } from "@/lib/browseChapterList";
import { translateText } from "@/lib/tokenizer";
import { ensureDictionaryDb } from "@/lib/dictionaryDb";
import { resolveSite } from "@/lib/sites/registry";

// Browse mode: a real, link-clickable proxy of the original site with
// translation applied in place -- see docs/PLANNED_FEATURES.md's
// successor design conversation and src/lib/htmlProxy.ts's doc comment
// for what is and isn't preserved (navigation only, no JS-driven
// interactivity). Different from the flat-text /surf mode above it.
// Rate-limited (shared "surf" bucket with /api/surf) and, for an
// anonymous visitor, forbidden from escalating to a real headless
// browser launch on a bot-challenged page -- see the planning doc's
// section 5.
export const dynamic = "force-dynamic";

const BROWSE_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 20 };

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
      <Link href="/surf" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft size={14} /> Đọc web
      </Link>
      <p className="text-destructive">{message}</p>
    </main>
  );
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; translate?: string }>;
}) {
  const { url, translate: translateParam } = await searchParams;
  const translate = translateParam !== "0";

  if (!url) {
    return <ErrorPage message="Thiếu tham số url." />;
  }
  if (!isSafePublicUrl(url)) {
    return <ErrorPage message="URL không hợp lệ (chỉ chấp nhận địa chỉ công khai http/https)." />;
  }

  const [session, headerList] = await Promise.all([auth(), headers()]);
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() ?? headerList.get("x-real-ip") ?? "unknown";
  const rateLimit = await checkRateLimit("surf", ip, BROWSE_RATE_LIMIT);
  if (!rateLimit.allowed) {
    await logActivity({ userId, action: "rate_limit.denied", targetType: "route", targetId: "/surf/browse" });
    return <ErrorPage message="Bạn thao tác quá nhanh -- vui lòng thử lại sau ít phút." />;
  }

  let bodyHtml: string;
  let rawHtml: string;
  try {
    rawHtml = await fetchRawHtml(url, { allowHeadless: userId !== null });
    // Browse mode's own fetch (browserFetch.ts's fetchRawHtml) is a
    // separate path from src/lib/scraper.ts's fetchHtml (which applies
    // this centrally for the embed pipeline) -- htmlProxy.ts is entirely
    // site-agnostic and has no other hook into per-site knowledge, so
    // this is applied explicitly here. See SiteDefinition.preprocessHtml's
    // doc comment (src/lib/sites/types.ts).
    const site = resolveSite(url);
    if (site?.preprocessHtml) rawHtml = await site.preprocessHtml(rawHtml, url);
    bodyHtml = await buildProxyPage(rawHtml, { pageUrl: url, translate });
  } catch (err) {
    if (err instanceof HeadlessBrowserRequiredError) {
      return <ErrorPage message={err.message} />;
    }
    return (
      <ErrorPage
        message={`Không tải được trang này: ${err instanceof Error ? err.message : "lỗi không rõ"}`}
      />
    );
  }

  // Best-effort only -- see browseChapterList.ts's doc comment. A source
  // this doesn't recognize (or a page that just isn't a book landing
  // page, e.g. a chapter page itself) simply renders with no panel,
  // falling back to whatever "start reading" affordance the proxied page
  // itself has.
  const rawChapters = await tryGetBrowseChapterList(rawHtml, url, userId !== null);
  if (translate && rawChapters.length > 0) await ensureDictionaryDb();
  const chapters = rawChapters.map((c) => ({ ...c, title: translate ? translateText(c.title) : c.title }));

  const toggleTranslateHref = `/surf/browse?url=${encodeURIComponent(url)}&translate=${translate ? "0" : "1"}`;
  const browseHref = (chapterUrl: string) =>
    `/surf/browse?url=${encodeURIComponent(chapterUrl)}&translate=${translate ? "1" : "0"}`;

  return (
    <main className="mx-auto flex max-w-4xl flex-1 flex-col gap-3 p-6">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
        <Link href="/surf" className="flex shrink-0 items-center gap-1 hover:text-foreground hover:underline">
          <ArrowLeft size={14} /> Đọc web
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate" title={url}>
            {url}
          </span>
          <Link
            href={toggleTranslateHref}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 transition-colors hover:bg-muted"
          >
            <Translate size={14} />
            {translate ? "Xem nguyên bản" : "Dịch"}
          </Link>
        </div>
      </div>

      {chapters.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <Link
            href={browseHref(chapters[0].url)}
            className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3 text-center font-medium text-white transition-opacity hover:opacity-90 dark:text-neutral-900"
          >
            <BookOpen size={18} weight="fill" />
            Bắt đầu đọc — {chapters[0].title}
          </Link>
          <p className="text-xs text-muted-foreground">Danh sách chương ({chapters.length})</p>
          <ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto">
            {chapters.map((chapter) => (
              <li key={chapter.url}>
                <Link
                  href={browseHref(chapter.url)}
                  className="block truncate rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted"
                >
                  {chapter.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="prose-reading rounded-lg border border-dashed border-border bg-card p-6"
        // Safe: buildProxyPage strips <script>, inline event-handler
        // attributes, and javascript: URLs before this ever renders --
        // see src/lib/htmlProxy.ts. This is the one place in the app
        // that needs dangerouslySetInnerHTML, since Browse mode renders
        // actual (sanitized) third-party markup, not plain text.
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </main>
  );
}
