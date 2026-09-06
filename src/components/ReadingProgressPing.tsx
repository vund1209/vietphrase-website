"use client";

// Invisible: fires a "continue reading" position save once per chapter
// view. Always writes to IndexedDB (see src/lib/clientSync.ts) so the
// homepage/novel page can render a continue-reading section for an
// anonymous reader too; also POSTs to Postgres when signed in, where
// ReadingProgress is now userId-scoped (see prisma/schema.prisma) --
// an anonymous reader's progress never reaches the server at all.
import { useEffect } from "react";
import { putReadingProgressLocal } from "@/lib/clientSync";

interface ReadingProgressPingProps {
  novelSlug: string;
  novelTitle: string;
  chapterNumber: number;
  isSignedIn: boolean;
}

export function ReadingProgressPing({
  novelSlug,
  novelTitle,
  chapterNumber,
  isSignedIn,
}: ReadingProgressPingProps) {
  useEffect(() => {
    putReadingProgressLocal(novelSlug, novelTitle, chapterNumber);
    if (!isSignedIn) return;
    fetch(`/api/novels/${novelSlug}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber }),
    }).catch(() => {
      // Best-effort -- a failed progress save shouldn't disrupt reading.
    });
  }, [novelSlug, novelTitle, chapterNumber, isSignedIn]);

  return null;
}
