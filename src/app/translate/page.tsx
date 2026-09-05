"use client";

import { useState } from "react";
import type { Token } from "@vietphrase/tokenizer";

export default function TranslatePage() {
  const [content, setContent] = useState("");
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTranslate() {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data: { tokens: Token[] } = await res.json();
      setTokens(data.tokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
      setTokens(null);
    } finally {
      setLoading(false);
    }
  }

  const translated = tokens?.map((t) => t.vietnamese).join(" ") ?? "";

  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Dịch nhanh (VietPhrase)</h1>
      <p className="text-sm text-neutral-500">
        Dán văn bản tiếng Trung vào ô bên trái, nhấn &quot;Dịch&quot; để xem kết quả VietPhrase.
        Công cụ này không lưu lại nội dung — xem{" "}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
          docs/ARCHITECTURE.md
        </code>
        .
      </p>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        <textarea
          className="min-h-[300px] w-full resize-y rounded-md border border-neutral-300 p-3 font-serif text-lg dark:border-neutral-700 dark:bg-neutral-900"
          placeholder="在下只想夺走各位的大宝剑..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="min-h-[300px] w-full whitespace-pre-wrap rounded-md border border-neutral-300 p-3 text-lg dark:border-neutral-700 dark:bg-neutral-900">
          {translated || (
            <span className="text-neutral-400">Kết quả sẽ hiện ở đây</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTranslate}
          disabled={loading || !content.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Đang dịch..." : "Dịch"}
        </button>
        {tokens && (
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="text-sm underline"
          >
            {showDetail ? "Ẩn chi tiết" : "Xem chi tiết từng cụm từ"}
          </button>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {showDetail && tokens && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-300 dark:border-neutral-700">
              <th className="py-1 pr-4">Nguồn</th>
              <th className="py-1 pr-4">Chữ Hán</th>
              <th className="py-1 pr-4">Hán Việt</th>
              <th className="py-1 pr-4">Vietphrase</th>
              <th className="py-1">Các lựa chọn khác</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t, i) => (
              <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800">
                <td className="py-1 pr-4 text-neutral-500">{t.source}</td>
                <td className="py-1 pr-4">{t.chinese}</td>
                <td className="py-1 pr-4 text-neutral-500">{t.hanViet}</td>
                <td className="py-1 pr-4">{t.vietnamese}</td>
                <td className="py-1 text-neutral-500">
                  {t.rawVietnamese !== t.vietnamese ? t.rawVietnamese : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
