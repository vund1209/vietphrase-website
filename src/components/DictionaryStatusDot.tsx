"use client";

// Small status signal for the bulk dictionary file (see
// src/lib/dictionaryDb.ts): green once ready, pulsing amber while a cold
// start is still downloading it, red on failure. Directly answers "is the
// DB ready or not" -- the exact race that caused chapter views to fail in
// production with "unable to open database file" before the fix that
// added ensureDictionaryDb() guards everywhere the tokenizer is used.
import { useEffect, useState } from "react";
import type { DictionaryStatus } from "@/lib/dictionaryDb";

const BASE_POLL_MS = 2000;
const MAX_POLL_MS = 30_000;
// See the planning doc's section 9 -- a flat 2s-forever poll was one of
// two "clearly wrong as shipped" regressions called out regardless of
// measurement. Caps total polling to a bounded window instead of
// continuing indefinitely on a stuck/very slow cold start, and backs off
// exponentially rather than hammering the endpoint every 2s the whole
// time.
const MAX_TOTAL_POLL_MS = 10 * 60 * 1000; // 10 minutes
// Errors get a stricter cap -- a transient blip is worth a couple of
// quick retries, but a persistent failure shouldn't poll forever.
const MAX_ERROR_ATTEMPTS = 3;

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

function describe(status: DictionaryStatus | null): { color: string; label: string; pulse: boolean } {
  if (!status) return { color: "bg-muted-foreground", label: "Đang kiểm tra từ điển...", pulse: false };
  switch (status.state) {
    case "ready":
      return { color: "bg-green-500", label: "Từ điển đã sẵn sàng", pulse: false };
    case "downloading": {
      const { downloadedBytes, totalBytes } = status;
      const detail = totalBytes
        ? `${formatMB(downloadedBytes)} / ${formatMB(totalBytes)} (${Math.round((downloadedBytes / totalBytes) * 100)}%)`
        : formatMB(downloadedBytes);
      return { color: "bg-amber-500", label: `Đang tải từ điển... ${detail}`, pulse: true };
    }
    case "error":
      return { color: "bg-red-500", label: `Lỗi tải từ điển: ${status.message}`, pulse: false };
    case "not_started":
      return { color: "bg-muted-foreground", label: "Từ điển chưa bắt đầu tải", pulse: false };
  }
}

export function DictionaryStatusDot() {
  const [status, setStatus] = useState<DictionaryStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    let attempt = 0;
    let errorAttempts = 0;

    function scheduleNext() {
      attempt++;
      const delay = Math.min(BASE_POLL_MS * 2 ** attempt, MAX_POLL_MS);
      if (Date.now() - startedAt + delay > MAX_TOTAL_POLL_MS) return; // give up -- stuck too long
      timer = setTimeout(poll, delay);
    }

    async function poll() {
      try {
        const res = await fetch("/api/dictionary/status");
        const data: DictionaryStatus = await res.json();
        if (cancelled) return;
        setStatus(data);
        if (data.state === "ready") return; // done polling
        if (data.state === "error") {
          errorAttempts++;
          if (errorAttempts >= MAX_ERROR_ATTEMPTS) return; // stop retrying a persistent failure
        }
        scheduleNext();
      } catch {
        if (cancelled) return;
        errorAttempts++;
        if (errorAttempts >= MAX_ERROR_ATTEMPTS) return;
        scheduleNext();
      }
    }
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const { color, label, pulse } = describe(status);

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color} ${pulse ? "animate-pulse" : ""}`}
    />
  );
}
