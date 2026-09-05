"use client";

// The editable box for a selected span of one or more adjacent tokens --
// modeled after sangtacviet.com's per-phrase editor (hv/HV/zw/Tr fields,
// expand-selection arrows, manage/promote actions, per-entry
// capitalization style, and a "reuse an existing entry" picker). See
// ChapterReader.tsx for the selection state this renders and
// docs/ARCHITECTURE.md "User management and per-word overrides" for the
// personal-vs-shared write paths this calls into.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CapStyle } from "@/lib/tokenizer";

export interface ReuseEntry {
  chineseText: string;
  vietnameseText: string;
  capStyle: CapStyle;
}

const CAP_STYLE_LABEL: Record<CapStyle, string> = {
  NONE: "Không",
  FIRST_LETTER: "Hoa chữ đầu",
  ALL_WORDS: "Hoa toàn bộ",
};

interface SpanEditorProps {
  novelSlug: string;
  /** Raw Chinese text of the current span (the `zw` field). */
  chinese: string;
  hanViet: string;
  onHanVietChange: (value: string) => void;
  hanVietCapitalized: string;
  onHanVietCapitalizedChange: (value: string) => void;
  /** Slash-joined candidate translations, e.g. "a/b/c" -- the first is the active default. */
  translation: string;
  onTranslationChange: (value: string) => void;
  capStyle: CapStyle;
  onCapStyleChange: (value: CapStyle) => void;
  canExpandLeft: boolean;
  canExpandRight: boolean;
  onExpandLeft: () => void;
  onExpandRight: () => void;
  canPromote: boolean;
  saving: boolean;
  error: string | null;
  onSavePersonal: () => void;
  onPromote: () => void;
  onReuseEntry: (entry: ReuseEntry) => void;
  onClose: () => void;
}

export function SpanEditor({
  novelSlug,
  chinese,
  hanViet,
  onHanVietChange,
  hanVietCapitalized,
  onHanVietCapitalizedChange,
  translation,
  onTranslationChange,
  capStyle,
  onCapStyleChange,
  canExpandLeft,
  canExpandRight,
  onExpandLeft,
  onExpandRight,
  canPromote,
  saving,
  error,
  onSavePersonal,
  onPromote,
  onReuseEntry,
  onClose,
}: SpanEditorProps) {
  const candidates = translation.split("/").map((s) => s.trim()).filter(Boolean);
  const [newCandidate, setNewCandidate] = useState("");
  const [reuseEntries, setReuseEntries] = useState<ReuseEntry[]>([]);

  function setCandidates(next: string[]) {
    onTranslationChange(next.join("/"));
  }

  function updateCandidate(index: number, value: string) {
    const next = [...candidates];
    next[index] = value;
    setCandidates(next);
  }

  function removeCandidate(index: number) {
    setCandidates(candidates.filter((_, i) => i !== index));
  }

  function moveCandidate(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= candidates.length) return;
    const next = [...candidates];
    [next[index], next[target]] = [next[target], next[index]];
    setCandidates(next);
  }

  function addCandidate() {
    const value = newCandidate.trim();
    if (!value) return;
    setCandidates([...candidates, value]);
    setNewCandidate("");
  }

  // Lightweight "Name trong kho" reuse lookup -- refetches whenever the
  // selected span changes (a discrete click/expand event, not free
  // typing, so no debounce needed).
  useEffect(() => {
    let cancelled = false;
    const load = (): Promise<{ entries?: ReuseEntry[] }> =>
      chinese
        ? fetch(`/api/novels/${novelSlug}/overrides/search?q=${encodeURIComponent(chinese)}`)
            .then((res) => (res.ok ? res.json() : { entries: [] }))
            .catch(() => ({ entries: [] }))
        : Promise.resolve({ entries: [] });
    load().then((data) => {
      if (!cancelled) setReuseEntries(data.entries ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [novelSlug, chinese]);

  return (
    <div
      data-span-editor="true"
      className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto border-t border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onExpandLeft}
            disabled={!canExpandLeft}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-30 dark:border-neutral-700"
          >
            ← Mở rộng
          </button>
          <span className="text-xs text-neutral-500">
            Chọn nhiều chữ liền nhau để tạo cụm từ điển mới
          </span>
          <button
            type="button"
            onClick={onExpandRight}
            disabled={!canExpandRight}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-30 dark:border-neutral-700"
          >
            Mở rộng →
          </button>
        </div>

        <div className="grid grid-cols-[2.5rem_1fr] items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-neutral-500">zw</span>
          <span className="flex items-center gap-2">
            <span className="font-medium">{chinese}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(chinese)}
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              title="Sao chép"
            >
              ⧉
            </button>
          </span>

          <label htmlFor="span-editor-hv" className="text-neutral-500">
            hv
          </label>
          <input
            id="span-editor-hv"
            value={hanViet}
            onChange={(e) => onHanVietChange(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
          />

          <label htmlFor="span-editor-hv-cap" className="text-neutral-500">
            HV
          </label>
          <input
            id="span-editor-hv-cap"
            value={hanVietCapitalized}
            onChange={(e) => onHanVietCapitalizedChange(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-500">Tr (các bản dịch, đầu tiên là mặc định)</span>
          {candidates.length === 0 && (
            <span className="text-xs text-neutral-400">Chưa có bản dịch nào.</span>
          )}
          {candidates.map((candidate, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="w-5 shrink-0 text-xs text-neutral-400">{i + 1}.</span>
              <input
                value={candidate}
                onChange={(e) => updateCandidate(i, e.target.value)}
                className={`flex-1 rounded-md border px-2 py-1 dark:bg-neutral-950 ${
                  i === 0
                    ? "border-neutral-400 font-medium dark:border-neutral-500"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
              />
              <button
                type="button"
                onClick={() => moveCandidate(i, -1)}
                disabled={i === 0}
                className="px-1 text-neutral-400 disabled:opacity-30"
                title="Đưa lên"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveCandidate(i, 1)}
                disabled={i === candidates.length - 1}
                className="px-1 text-neutral-400 disabled:opacity-30"
                title="Đưa xuống"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeCandidate(i)}
                className="px-1 text-red-500"
                title="Xóa"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <span className="w-5 shrink-0" />
            <input
              value={newCandidate}
              onChange={(e) => setNewCandidate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCandidate();
                }
              }}
              placeholder="Thêm bản dịch khác…"
              className="flex-1 rounded-md border border-dashed border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
            <button
              type="button"
              onClick={addCandidate}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
            >
              + Thêm
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Kiểu viết hoa</span>
          {(Object.keys(CAP_STYLE_LABEL) as CapStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => onCapStyleChange(style)}
              className={`rounded-md border px-2 py-1 text-xs ${
                capStyle === style
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            >
              {CAP_STYLE_LABEL[style]}
            </button>
          ))}
        </div>

        {reuseEntries.length > 0 && (
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-neutral-500">Name trong kho</span>
            {reuseEntries.map((entry) => (
              <div
                key={entry.chineseText}
                className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 px-2 py-1 dark:border-neutral-800"
              >
                <span className="truncate">
                  {entry.chineseText} → {entry.vietnameseText.split("/")[0]}
                </span>
                <button
                  type="button"
                  onClick={() => onReuseEntry(entry)}
                  className="shrink-0 rounded-md border border-neutral-300 px-2 py-0.5 dark:border-neutral-700"
                >
                  Dùng
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onSavePersonal}
            disabled={saving}
            className="rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {saving ? "Đang lưu…" : "Lưu riêng"}
          </button>
          {canPromote && (
            <button
              type="button"
              onClick={onPromote}
              disabled={saving}
              className="rounded-md border border-neutral-300 px-3 py-2 disabled:opacity-50 dark:border-neutral-700"
            >
              Thêm vào từ điển chung
            </button>
          )}
          <Link
            href={`/novels/${novelSlug}/overrides`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Quản lý
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
          >
            Hủy
          </button>
        </div>
        <p className="text-xs text-neutral-400">
          Cụm dài hơn tạo một mục từ điển riêng, không xóa các mục ngắn hơn -- chúng vẫn áp dụng ở
          nơi khác.
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
