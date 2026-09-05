"use client";

// Admin-only: clear this chapter's cached raw text so the next view
// re-scrapes it from source. See the route this calls
// (src/app/api/novels/[slug]/chapters/[number]/refetch/route.ts), which
// re-checks the ADMIN role server-side.
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  novelSlug: string;
  chapterNumber: number;
}

export function RefetchChapterButton({ novelSlug, chapterNumber }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    if (
      !window.confirm(
        `Tải lại chương ${chapterNumber} từ nguồn? Nội dung đã lưu sẽ bị xóa và lấy lại từ trang gốc.`
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch(`/api/novels/${novelSlug}/chapters/${chapterNumber}/refetch`, {
      method: "POST",
    });
    setPending(false);

    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Không thể tải lại.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={refetch}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
      >
        {pending ? "Đang tải lại…" : "Tải lại từ nguồn"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
