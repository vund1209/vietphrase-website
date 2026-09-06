"use client";

// Editor-only action: promotes one reader's private override into the
// novel's shared Name dictionary. See docs/ARCHITECTURE.md "User
// management and per-word overrides" and the promote API route this
// calls (src/app/api/novels/[slug]/overrides/promote/route.ts), which
// re-checks the EDITOR role server-side -- this button being visible is
// a UI nicety, not the actual access control.
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  novelSlug: string;
  chineseText: string;
  vietnameseText: string;
  track: "phrase" | "name";
}

export function PromoteOverrideButton({ novelSlug, chineseText, vietnameseText, track }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handlePromote() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/novels/${novelSlug}/overrides/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chineseText, vietnameseText, track }),
    });
    setPending(false);

    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Không thể áp dụng cho mọi người.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return <span className="text-sm text-green-600 dark:text-green-400">Đã áp dụng chung</span>;
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handlePromote}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-700"
      >
        {pending ? "Đang áp dụng…" : "Áp dụng cho mọi người"}
      </button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
