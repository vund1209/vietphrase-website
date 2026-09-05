"use client";

// "Surf" mode: paste any URL, see it fetched + translated on the spot,
// nothing saved (no Novel/Chapter rows) -- different from the homepage's
// add-by-URL, which permanently embeds a novel with a chapter list. See
// docs/PLANNED_FEATURES.md and src/app/api/surf/route.ts.
//
// Two flavors: "Xem" below does a one-shot flat-text fetch+translate.
// "Duyệt như trang gốc" instead opens /surf/browse -- a real
// link-clickable proxy of the site (menu, chapter links, table of
// contents) with translation applied in place, for actually navigating
// around a site rather than reading one page at a time.
import Link from "next/link";
import { useState } from "react";

interface SurfResult {
  title: string | null;
  content: string;
  translated: boolean;
}

export default function SurfPage() {
  const [url, setUrl] = useState("");
  const [skipTranslate, setSkipTranslate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SurfResult | null>(null);

  async function handleSurf() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/surf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), skipTranslate }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setResult(body as SurfResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Đọc web</h1>
      <p className="text-sm text-neutral-500">
        Dán URL một trang chương/nội dung tiếng Trung để xem bản dịch ngay -- không lưu lại, khác
        với &quot;Thêm truyện&quot; ở trang chủ (lưu cả truyện lâu dài). Trang nào có chặn bot chặt
        chẽ có thể không lấy được nội dung.
      </p>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://.../chuong-1"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="button"
          onClick={handleSurf}
          disabled={loading || !url.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Đang tải..." : "Xem"}
        </button>
        <Link
          href={url.trim() ? `/surf/browse?url=${encodeURIComponent(url.trim())}` : "#"}
          aria-disabled={!url.trim()}
          className={`rounded-md border border-neutral-300 px-4 py-2 dark:border-neutral-700 ${
            !url.trim() ? "pointer-events-none opacity-40" : ""
          }`}
        >
          Duyệt như trang gốc
        </Link>
      </div>
      <p className="text-xs text-neutral-400">
        &quot;Duyệt như trang gốc&quot; mở một bản sao có thể bấm liên kết (menu, mục lục, chương) --
        chỉ điều hướng, không có tính năng tương tác phức tạp (tìm kiếm, đăng nhập...).
      </p>

      <label className="flex items-center gap-2 text-sm text-neutral-500">
        <input
          type="checkbox"
          checked={skipTranslate}
          onChange={(e) => setSkipTranslate(e.target.checked)}
        />
        Không dịch, chỉ xem nguyên bản
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <article className="prose-reading mt-2 text-lg">
          {result.title && <h2 className="mb-4 text-xl font-semibold">{result.title}</h2>}
          {result.content.split("\n").map((line, i) => (
            <p key={i}>{line || " "}</p>
          ))}
        </article>
      )}
    </main>
  );
}
