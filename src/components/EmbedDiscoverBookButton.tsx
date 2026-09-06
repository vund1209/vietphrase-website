"use client";

// "Nhúng" here calls the exact same embed pipeline as AddBookForm's
// "Nhúng từ URL" (POST /api/novels) -- Discover mode is just a curated,
// browsable front door to it for a source the user doesn't already have
// a direct book URL for. See the planning doc's section 14 and
// src/app/api/novels/route.ts (idempotent on sourceUrl, so re-clicking an
// already-embedded book just redirects instead of erroring).
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadSimple } from "@phosphor-icons/react";

interface EmbedDiscoverBookButtonProps {
  url: string;
  isSignedIn: boolean;
}

export function EmbedDiscoverBookButton({ url, isSignedIn }: EmbedDiscoverBookButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!isSignedIn) {
    return (
      <Link
        href="/login?callbackUrl=/surf/discover"
        className="flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        Đăng nhập để nhúng
      </Link>
    );
  }

  async function handleEmbed() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/novels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Yêu cầu thất bại (${res.status})`);
      setStatus("done");
      router.push(`/novels/${data.novel.slug}`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleEmbed}
        disabled={status === "loading" || status === "done"}
        className="flex cursor-pointer items-center justify-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-900"
      >
        <DownloadSimple size={13} weight="bold" />
        {status === "loading" ? "Đang nhúng..." : status === "done" ? "Đã nhúng" : "Nhúng"}
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
