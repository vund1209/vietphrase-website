"use client";

// Admin-only action: checks the novel's source site for chapters published
// since it was added, and appends any it finds. See the POST handler this
// calls (src/app/api/novels/[slug]/refetch-chapters/route.ts) -- there's no
// automatic sync, this is the only way an ongoing book's chapter list ever
// grows past what it had at add time.
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  novelSlug: string;
}

export function CheckNewChaptersButton({ novelSlug }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleCheck() {
    setPending(true);
    setMessage(null);
    setIsError(false);
    const res = await fetch(`/api/novels/${novelSlug}/refetch-chapters`, { method: "POST" });
    const body: { added?: number; error?: string } | null = await res.json().catch(() => null);
    setPending(false);

    if (!res.ok) {
      setIsError(true);
      setMessage(body?.error ?? "Không thể kiểm tra chương mới.");
      return;
    }
    const added = body?.added ?? 0;
    setMessage(added > 0 ? `Đã thêm ${added} chương mới.` : "Không có chương mới.");
    if (added > 0) router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCheck}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-700"
      >
        {pending ? "Đang kiểm tra…" : "Kiểm tra chương mới"}
      </button>
      {message && (
        <span
          className={`text-sm ${isError ? "text-red-600 dark:text-red-400" : "text-neutral-500"}`}
        >
          {message}
        </span>
      )}
    </span>
  );
}
