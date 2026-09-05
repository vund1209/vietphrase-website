"use client";

// Invisible: fires a "continue reading" position save once per chapter
// view. A client-side ping (rather than saving directly from the
// chapter page's server component) is what lets a plain Route Handler
// own the cookie-writing responsibility -- Server Components can't set
// cookies mid-render. See src/app/api/novels/[slug]/progress/route.ts.
import { useEffect } from "react";

interface ReadingProgressPingProps {
  novelSlug: string;
  chapterNumber: number;
}

export function ReadingProgressPing({ novelSlug, chapterNumber }: ReadingProgressPingProps) {
  useEffect(() => {
    fetch(`/api/novels/${novelSlug}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber }),
    }).catch(() => {
      // Best-effort -- a failed progress save shouldn't disrupt reading.
    });
  }, [novelSlug, chapterNumber]);

  return null;
}
