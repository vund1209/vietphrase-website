"use client";

// Renders the "continue reading" CTA and per-chapter "Đang đọc" badge for
// one novel. Signed-in progress is resolved server-side (Postgres,
// userId-scoped -- see prisma/schema.prisma's ReadingProgress) and passed
// in directly; an anonymous reader has no server-side row at all (see the
// planning doc's section 4), so this reads src/lib/clientSync.ts's
// IndexedDB store on mount instead. Client component either way so the
// two cases share one render path instead of duplicating this markup.
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "@phosphor-icons/react";
import { getReadingProgressLocal } from "@/lib/clientSync";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chưa tải",
  SCRAPED: "Sẵn sàng",
  ERROR: "Lỗi",
};

interface ChapterSummary {
  chapterNumber: number;
  title: string;
  status: string;
}

interface NovelProgressSectionProps {
  novelSlug: string;
  chapters: ChapterSummary[];
  serverProgress: number | null;
  isSignedIn: boolean;
}

export function NovelProgressSection({
  novelSlug,
  chapters,
  serverProgress,
  isSignedIn,
}: NovelProgressSectionProps) {
  const [progress, setProgress] = useState<number | null>(serverProgress);

  useEffect(() => {
    if (isSignedIn) return;
    let cancelled = false;
    getReadingProgressLocal(novelSlug).then((record) => {
      if (!cancelled && record) setProgress(record.chapterNumber);
    });
    return () => {
      cancelled = true;
    };
  }, [novelSlug, isSignedIn]);

  if (chapters.length === 0) return null;

  return (
    <>
      <Link
        href={`/novels/${novelSlug}/chapters/${progress ?? 1}`}
        className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3 text-center font-medium text-white transition-opacity hover:opacity-90 dark:text-neutral-900"
      >
        <BookOpen size={18} weight="fill" />
        {progress ? `Tiếp tục đọc — Chương ${progress}` : "Bắt đầu đọc — Chương 1"}
      </Link>

      <ul className="flex flex-col divide-y divide-border">
        {chapters.map((chapter) => (
          <li key={chapter.chapterNumber}>
            <Link
              href={`/novels/${novelSlug}/chapters/${chapter.chapterNumber}`}
              className="flex items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-muted"
            >
              <span>
                Chương {chapter.chapterNumber}: {chapter.title}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {progress === chapter.chapterNumber && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium">Đang đọc</span>
                )}
                {STATUS_LABEL[chapter.status] ?? chapter.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
