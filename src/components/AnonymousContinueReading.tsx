"use client";

// Homepage's "Tiếp tục đọc" section for an anonymous reader -- the server
// has nothing to render for this case (ReadingProgress is userId-scoped
// now, see prisma/schema.prisma), so this reads src/lib/clientSync.ts's
// IndexedDB store on mount instead. Renders nothing (not even a
// container) until it has data, avoiding a layout flash for readers with
// no local progress at all.
import { useEffect, useState } from "react";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { getAllReadingProgress, type ReadingProgressRecord } from "@/lib/clientSync";

const MAX_ENTRIES = 6;

export function AnonymousContinueReading() {
  const [entries, setEntries] = useState<ReadingProgressRecord[] | null>(null);

  useEffect(() => {
    getAllReadingProgress().then((records) => {
      const sorted = [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setEntries(sorted.slice(0, MAX_ENTRIES));
    });
  }, []);

  if (!entries || entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">Tiếp tục đọc</h2>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {entries.map((e) => (
          <Link
            key={e.novelSlug}
            href={`/novels/${e.novelSlug}/chapters/${e.chapterNumber}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted"
          >
            <span className="truncate font-medium">{e.novelTitle}</span>
            <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
              Chương {e.chapterNumber}
              <CaretRight size={14} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
