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
import { BookOpen, Compass, Globe } from "@phosphor-icons/react";

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
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold">Đọc web</h1>
        <p className="text-sm text-muted-foreground">
          Dán URL một trang chương/nội dung tiếng Trung -- không lưu lại, khác với &quot;Thêm
          truyện&quot; ở trang chủ (lưu cả truyện lâu dài). Trang nào có chặn bot chặt chẽ có thể
          không lấy được nội dung.
        </p>
      </div>

      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://.../chuong-1"
        className="rounded-md border border-border bg-card px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={handleSurf}
          disabled={loading || !url.trim()}
          className="flex cursor-pointer flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
        >
          <Globe size={22} className="text-accent" weight="duotone" />
          <span className="font-medium">{loading ? "Đang tải..." : "Xem"}</span>
          <span className="text-xs text-muted-foreground">
            Bản dịch dạng văn bản, xem nhanh một trang.
          </span>
        </button>
        <Link
          href={url.trim() ? `/surf/browse?url=${encodeURIComponent(url.trim())}` : "#"}
          aria-disabled={!url.trim()}
          className={`flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
            !url.trim() ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <BookOpen size={22} className="text-accent" weight="duotone" />
          <span className="font-medium">Duyệt như trang gốc</span>
          <span className="text-xs text-muted-foreground">
            Bấm liên kết, mục lục, chương -- điều hướng như trang thật.
          </span>
        </Link>
        <Link
          href="/surf/discover"
          className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <Compass size={22} className="text-accent" weight="duotone" />
          <span className="font-medium">Khám phá theo nguồn</span>
          <span className="text-xs text-muted-foreground">
            Duyệt danh sách truyện thật từ các trang đã hỗ trợ, không cần dán URL.
          </span>
        </Link>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={skipTranslate}
          onChange={(e) => setSkipTranslate(e.target.checked)}
        />
        Không dịch, chỉ xem nguyên bản
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <article className="prose-reading mt-2 rounded-lg border border-border bg-card p-6 text-lg">
          {result.title && <h2 className="mb-4 font-display text-xl font-semibold">{result.title}</h2>}
          {result.content.split("\n").map((line, i) => (
            <p key={i}>{line || " "}</p>
          ))}
        </article>
      )}
    </main>
  );
}
