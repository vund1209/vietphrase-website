"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddBookForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/novels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Yêu cầu thất bại (${res.status})`);
      }
      router.push(`/novels/${data.novel.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="url"
          required
          placeholder="Dán URL trang mục lục truyện (ví dụ: https://.../book/123/)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Đang thêm..." : "Thêm truyện"}
        </button>
      </div>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
