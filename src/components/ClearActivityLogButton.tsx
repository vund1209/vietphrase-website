"use client";

// Admin-only action on /admin/activity -- see the DELETE handler this
// calls (src/app/api/admin/activity/route.ts), which re-checks the
// ADMIN role server-side; this button being visible is a UI nicety, not
// the actual access control. Same confirm-then-fetch shape as
// DeleteNovelButton.tsx.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClearActivityLogButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClear() {
    if (!window.confirm("Xóa toàn bộ nhật ký hoạt động? Không thể hoàn tác.")) {
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch("/api/admin/activity", { method: "DELETE" });
    setPending(false);

    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Không thể xóa nhật ký.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClear}
        disabled={pending}
        className="cursor-pointer rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-400"
      >
        {pending ? "Đang xóa…" : "Xóa lịch sử"}
      </button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
