"use client";

// Admin-only control to set/clear a novel's ongoing/completed badge. See
// the PATCH handler this calls (src/app/api/novels/[slug]/route.ts),
// which re-checks the ADMIN role server-side.
import { useState } from "react";
import { useRouter } from "next/navigation";

type CompletionStatus = "ONGOING" | "COMPLETED" | null;

interface Props {
  novelSlug: string;
  current: CompletionStatus;
}

export function CompletionStatusToggle({ novelSlug, current }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setStatus(completionStatus: CompletionStatus) {
    setPending(true);
    await fetch(`/api/novels/${novelSlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completionStatus }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <span className="flex items-center gap-1 text-xs">
      <button
        type="button"
        disabled={pending || current === "ONGOING"}
        onClick={() => setStatus("ONGOING")}
        className="rounded-md border border-neutral-300 px-2 py-0.5 disabled:opacity-40 dark:border-neutral-700"
      >
        Đang tiến hành
      </button>
      <button
        type="button"
        disabled={pending || current === "COMPLETED"}
        onClick={() => setStatus("COMPLETED")}
        className="rounded-md border border-neutral-300 px-2 py-0.5 disabled:opacity-40 dark:border-neutral-700"
      >
        Đã hoàn thành
      </button>
    </span>
  );
}
