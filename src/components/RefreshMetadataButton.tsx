"use client";

// Admin-only action: re-fetches title/description/author/cover from the
// novel's source URL. See the POST handler this calls
// (src/app/api/novels/[slug]/refetch-metadata/route.ts), which re-checks
// the ADMIN role server-side.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";

interface Props {
  novelSlug: string;
}

export function RefreshMetadataButton({ novelSlug }: Props) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/novels/${novelSlug}/refetch-metadata`, { method: "POST" });
    setPending(false);

    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Không thể tải lại thông tin truyện.");
      return;
    }
    showToast("Đã cập nhật thông tin truyện.");
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-700"
      >
        {pending ? "Đang tải lại…" : "Tải lại thông tin"}
      </button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
