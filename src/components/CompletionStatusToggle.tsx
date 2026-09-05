"use client";

// Admin-only control to set/clear a novel's ongoing/completed badge. See
// the PATCH handler this calls (src/app/api/novels/[slug]/route.ts),
// which re-checks the ADMIN role server-side.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";

type CompletionStatus = "ONGOING" | "COMPLETED" | null;

interface Props {
  novelSlug: string;
  current: CompletionStatus;
}

const STATUS_LABEL: Record<Exclude<CompletionStatus, null>, string> = {
  ONGOING: "Đang tiến hành",
  COMPLETED: "Đã hoàn thành",
};

export function CompletionStatusToggle({ novelSlug, current }: Props) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, setPending] = useState(false);

  async function setStatus(completionStatus: CompletionStatus) {
    setPending(true);
    const res = await fetch(`/api/novels/${novelSlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completionStatus }),
    });
    setPending(false);
    if (res.ok) {
      showToast(`Đã đổi trạng thái: ${completionStatus ? STATUS_LABEL[completionStatus] : "Không rõ"}.`);
    } else {
      showToast("Không thể đổi trạng thái.", "error");
    }
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
