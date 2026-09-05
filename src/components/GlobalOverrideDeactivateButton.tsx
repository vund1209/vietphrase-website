"use client";

// Admin-only: deactivate (or reactivate) a global dictionary entry. See
// the PATCH handler this calls (src/app/api/dictionary/global/[id]/route.ts),
// which re-checks the ADMIN role server-side.
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  id: number;
  isActive: boolean;
}

export function GlobalOverrideDeactivateButton({ id, isActive }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    await fetch(`/api/dictionary/global/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
    >
      {isActive ? "Vô hiệu hóa" : "Kích hoạt lại"}
    </button>
  );
}
