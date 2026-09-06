"use client";

// Collapsible, off-by-default panel above the chapter text: lists
// candidate proper nouns detected in *this* chapter (see
// src/lib/candidateNames.ts) so a reader can bulk-review and quick-add
// them to the Name dictionary instead of selecting one word at a time.
// Fetches lazily, only once the panel is first expanded -- most chapter
// views won't open it, so this avoids paying the scan cost on every view.
import { useState } from "react";
import { CaretDown, CaretRight, Check } from "@phosphor-icons/react";
import { useToast } from "./ToastProvider";
import { putPersonalOverride } from "@/lib/clientSync";

interface Candidate {
  chineseText: string;
  hanViet: string;
  occurrences: number;
  suggested: string;
}

interface CandidateNamesPanelProps {
  novelSlug: string;
  chapterNumber: number;
  isSignedIn: boolean;
}

export function CandidateNamesPanel({ novelSlug, chapterNumber, isSignedIn }: CandidateNamesPanelProps) {
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && candidates === null) {
      setLoading(true);
      const res = await fetch(
        `/api/novels/${novelSlug}/chapters/${chapterNumber}/candidate-names`
      );
      const data: { candidates?: Candidate[] } | null = await res.json().catch(() => null);
      setCandidates(data?.candidates ?? []);
      setLoading(false);
    }
  }

  async function addToDictionary(candidate: Candidate) {
    // Anonymous: IndexedDB only, same as ChapterReader's personal save --
    // never creates a UserNameOverride row (see src/lib/clientSync.ts).
    if (!isSignedIn) {
      await putPersonalOverride({
        novelSlug,
        chineseText: candidate.chineseText,
        vietnameseText: candidate.suggested,
        capStyle: "ALL_WORDS",
        track: "name",
        updatedAt: new Date().toISOString(),
      });
      setAdded((prev) => new Set(prev).add(candidate.chineseText));
      showToast("Đã lưu (chỉ trên trình duyệt này).");
      return;
    }

    const res = await fetch(`/api/novels/${novelSlug}/overrides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chineseText: candidate.chineseText,
        vietnameseText: candidate.suggested,
        capStyle: "ALL_WORDS",
        track: "name",
      }),
    });
    if (res.ok) {
      await putPersonalOverride({
        novelSlug,
        chineseText: candidate.chineseText,
        vietnameseText: candidate.suggested,
        capStyle: "ALL_WORDS",
        track: "name",
        updatedAt: new Date().toISOString(),
      });
      setAdded((prev) => new Set(prev).add(candidate.chineseText));
      showToast("Đã lưu (chỉ mình bạn thấy).");
    }
  }

  function hide(chineseText: string) {
    setHidden((prev) => new Set(prev).add(chineseText));
  }

  const visible = candidates?.filter((c) => !hidden.has(c.chineseText)) ?? [];

  return (
    <div className="mb-4 rounded-md border border-border text-sm">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 font-medium"
      >
        {open ? <CaretDown size={14} /> : <CaretRight size={14} />}
        Tên riêng & thuật ngữ
        {candidates && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
            {visible.length}
          </span>
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-1 border-t border-border p-2">
          {loading && <span className="text-xs text-muted-foreground">Đang quét chương…</span>}
          {!loading && visible.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Không tìm thấy từ nào có vẻ chưa có trong từ điển.
            </span>
          )}
          {visible.map((c) => (
            <div
              key={c.chineseText}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted"
            >
              <span className="truncate">
                <span className="font-medium">{c.chineseText}</span>
                <span className="mx-1 text-muted-foreground">→ {c.hanViet}</span>
                <span className="text-xs text-muted-foreground">×{c.occurrences}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {added.has(c.chineseText) ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <Check size={14} /> Đã thêm
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => addToDictionary(c)}
                    className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    + Từ điển
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => hide(c.chineseText)}
                  className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"
                >
                  Ẩn
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
