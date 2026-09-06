import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/adminActivity";
import { fetchRawHtml } from "@/lib/browserFetch";
import { HeadlessBrowserRequiredError } from "@/lib/fetchErrors";
import { getDiscoverSite } from "@/lib/sites/registry";
import type { DiscoverSort } from "@/lib/sites/types";
import { translateText } from "@/lib/tokenizer";
import { ensureDictionaryDb } from "@/lib/dictionaryDb";
import { DiscoverBookCard } from "@/components/DiscoverBookCard";

// A single site's live book list -- fetched and parsed on every request
// (the site definition's getBookList), nothing written to Postgres here. Same
// rate-limiting/login-gated-headless-fallback shape as /surf/browse (see
// the planning doc's section 5): anonymous browsing is allowed but
// rate-limited, only a signed-in reader may escalate to a real headless
// browser launch if this source ever turns out to be bot-challenged.
// Embedding a specific book (DiscoverBookCard's button) is the existing,
// unrelated POST /api/novels flow -- this page only ever reads.
export const dynamic = "force-dynamic";

const DISCOVER_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 30 };

// Process-local, short-TTL cache for the fetched list HTML -- a book-list
// page's content doesn't change meaningfully minute-to-minute, and for a
// Cloudflare-protected source (currently only 69shuba.com) a signed-in
// reader's fetch pays a real headless-browser launch every single time
// without this. Only successful fetches are cached (a thrown
// HeadlessBrowserRequiredError never reaches the `.set` below), so an
// anonymous visitor hitting a still-uncached, challenged source still
// gets that same clear error as before -- this only avoids *repeat*
// Chromium launches for the same URL within the window, across every
// reader, not a correctness change.
const LIST_HTML_CACHE_TTL_MS = 5 * 60 * 1000;
const listHtmlCache = new Map<string, { html: string; expiresAt: number }>();

async function fetchListHtmlCached(url: string, allowHeadless: boolean): Promise<string> {
  const now = Date.now();
  const cached = listHtmlCache.get(url);
  if (cached && cached.expiresAt > now) return cached.html;

  const html = await fetchRawHtml(url, { allowHeadless });
  listHtmlCache.set(url, { html, expiresAt: now + LIST_HTML_CACHE_TTL_MS });
  return html;
}

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="mx-auto flex max-w-4xl flex-1 flex-col gap-4 p-6">
      <Link
        href="/surf/discover"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft size={14} /> Khám phá theo nguồn
      </Link>
      <p className="text-destructive">{message}</p>
    </main>
  );
}

export default async function DiscoverSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ source: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const { source: sourceId } = await params;
  const site = getDiscoverSite(sourceId);
  if (!site) notFound();

  const { page: pageParam, sort: sortParam } = await searchParams;
  const sort: DiscoverSort = sortParam === "weekly" ? "weekly" : "all";
  const page = Math.max(1, Number(pageParam) || 1);

  const [session, headerList] = await Promise.all([auth(), headers()]);
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0].trim() ?? headerList.get("x-real-ip") ?? "unknown";
  const rateLimit = await checkRateLimit("discover", ip, DISCOVER_RATE_LIMIT);
  if (!rateLimit.allowed) {
    await logActivity({ userId, action: "rate_limit.denied", targetType: "route", targetId: "/surf/discover" });
    return <ErrorPage message="Bạn thao tác quá nhanh -- vui lòng thử lại sau ít phút." />;
  }

  const listUrl = site.discover.buildListUrl(page, sort);

  let books;
  try {
    const html = await fetchListHtmlCached(listUrl, userId !== null);
    // Belt-and-suspenders alongside instrumentation.ts's register() hook --
    // see src/lib/novels.ts's getOrTranslateChapter for why this exists.
    await ensureDictionaryDb();
    books = site.discover.getBookList(html, listUrl).map((book) => ({
      ...book,
      translatedTitle: translateText(book.title),
      translatedDescription: book.description ? translateText(book.description) : null,
    }));
  } catch (err) {
    if (err instanceof HeadlessBrowserRequiredError) {
      return <ErrorPage message={err.message} />;
    }
    return (
      <ErrorPage
        message={`Không tải được danh sách truyện: ${err instanceof Error ? err.message : "lỗi không rõ"}`}
      />
    );
  }

  const sortHref = (s: DiscoverSort) => `/surf/discover/${site.id}?sort=${s}`;
  const pageHref = (p: number) => `/surf/discover/${site.id}?sort=${sort}&page=${p}`;

  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-4 p-6">
      <Link
        href="/surf/discover"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft size={14} /> Khám phá theo nguồn
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{site.displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Danh sách truyện thật lấy trực tiếp từ {site.discover.hostname} -- bấm vào một truyện để đọc thử
          ngay (dịch trực tiếp, không lưu lại), hoặc bấm &quot;Nhúng&quot; để thêm hẳn vào thư viện.
        </p>
      </div>

      <div className="flex w-fit gap-1 rounded-md border border-border p-1 text-sm">
        <Link
          href={sortHref("all")}
          className={`rounded px-3 py-1 transition-colors ${
            sort === "all" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          Tất cả
        </Link>
        <Link
          href={sortHref("weekly")}
          className={`rounded px-3 py-1 transition-colors ${
            sort === "weekly" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          Mới cập nhật trong tuần
        </Link>
      </div>

      {books.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không tìm thấy truyện nào trên trang này.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book) => (
            <DiscoverBookCard key={book.url} book={book} isSignedIn={Boolean(session?.user)} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <Link
          href={pageHref(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={`flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-muted ${
            page <= 1 ? "pointer-events-none opacity-40" : ""
          }`}
        >
          <CaretLeft size={14} /> Trước
        </Link>
        <span className="text-muted-foreground">Trang {page}</span>
        <Link
          href={pageHref(page + 1)}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-muted"
        >
          Sau <CaretRight size={14} />
        </Link>
      </div>
    </main>
  );
}
