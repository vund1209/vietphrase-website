import Link from "next/link";
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
        <Link href="/surf" className="text-sm text-neutral-500 hover:underline">
          ← Đọc web
        </Link>
        <p className="text-red-600 dark:text-red-400">Thiếu tham số url.</p>
      </main>
    );
  }
  if (!isSafePublicUrl(url)) {
    return (
      <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
        <Link href="/surf" className="text-sm text-neutral-500 hover:underline">
          ← Đọc web
        </Link>
        <p className="text-red-600 dark:text-red-400">
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
        <Link href="/surf" className="text-sm text-neutral-500 hover:underline">
          ← Đọc web
        </Link>
        <p className="text-red-600 dark:text-red-400">
          Không tải được trang này: {err instanceof Error ? err.message : "lỗi không rõ"}
        </p>
      </main>
    );
  }

  const toggleTranslateHref = `/surf/browse?url=${encodeURIComponent(url)}&translate=${translate ? "0" : "1"}`;

  return (
    <main className="mx-auto flex max-w-4xl flex-1 flex-col gap-3 p-6">
      <div className="flex items-center justify-between gap-4 text-sm text-neutral-500">
        <Link href="/surf" className="hover:underline">
          ← Đọc web
        </Link>
        <div className="flex items-center gap-3">
          <span className="truncate" title={url}>
            {url}
          </span>
          <Link href={toggleTranslateHref} className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">
            {translate ? "Xem nguyên bản" : "Dịch"}
          </Link>
        </div>
      </div>
      <div
        className="prose-reading"
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
