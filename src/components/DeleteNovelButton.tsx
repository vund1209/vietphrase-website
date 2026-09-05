"use client";

// Admin-only action: permanently removes a novel (and its chapters/Name
// overrides/UserWordOverride rows, via cascade) from the library. See
// the DELETE handler this calls (src/app/api/novels/[slug]/route.ts),
// which re-checks the ADMIN role server-side -- this button being
// visible is a UI nicety, not the actual access control.
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  novelSlug: string;
  novelTitle: string;
  /** Where to send the browser after a successful delete. */
  redirectTo?: string;
}

export function DeleteNovelButton({ novelSlug, novelTitle, redirectTo }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(`Xóa truyện "${novelTitle}" khỏi thư viện? Không thể hoàn tác.`)) {
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch(`/api/novels/${novelSlug}`, { method: "DELETE" });
    setPending(false);

    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Không thể xóa truyện.");
      return;
    }
    if (redirectTo) {
      router.push(redirectTo);
    }
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="rounded-md border border-red-300 px-2 py-1 text-sm text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
      >
        {pending ? "Đang xóa…" : "Xóa truyện"}
      </button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
