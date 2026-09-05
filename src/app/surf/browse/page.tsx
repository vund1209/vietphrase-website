import Link from "next/link";
import { ArrowLeft, Translate } from "@phosphor-icons/react/dist/ssr";
import { fetchRawHtml } from "@/lib/browserFetch";
import { buildProxyPage } from "@/lib/htmlProxy";
import { isSafePublicUrl } from "@/lib/urlSafety";

// Browse mode: a real, link-clickable proxy of the original site with
// translation applied in place -- see docs/PLANNED_FEATURES.md's
// successor design conversation and src/lib/htmlProxy.ts's doc comment
// for what is and isn't preserved (navigation only, no JS-driven
// interactivity). Different from the flat-text /surf mode above it.
export const dynamic = "force-dynamic";

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; translate?: string }>;
}) {
  const { url, translate: translateParam } = await searchParams;
  const translate = translateParam !== "0";

  if (!url) {
    return (
      <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
        <Link href="/surf" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft size={14} /> Đọc web
        </Link>
        <p className="text-destructive">Thiếu tham số url.</p>
      </main>
    );
  }
  if (!isSafePublicUrl(url)) {
    return (
      <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
        <Link href="/surf" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft size={14} /> Đọc web
        </Link>
        <p className="text-destructive">
          URL không hợp lệ (chỉ chấp nhận địa chỉ công khai http/https).
        </p>
      </main>
    );
  }

  let bodyHtml: string;
  try {
    const rawHtml = await fetchRawHtml(url);
    bodyHtml = buildProxyPage(rawHtml, { pageUrl: url, translate });
  } catch (err) {
    return (
      <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
        <Link href="/surf" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft size={14} /> Đọc web
        </Link>
        <p className="text-destructive">
          Không tải được trang này: {err instanceof Error ? err.message : "lỗi không rõ"}
        </p>
      </main>
    );
  }

  const toggleTranslateHref = `/surf/browse?url=${encodeURIComponent(url)}&translate=${translate ? "0" : "1"}`;

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
