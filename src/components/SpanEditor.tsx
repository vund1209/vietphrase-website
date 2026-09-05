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
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, CaretLeft, CaretRight, Copy, X } from "@phosphor-icons/react";
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
  canApplyGlobally: boolean;
  saving: boolean;
  error: string | null;
  onSavePersonal: () => void;
  onPromote: () => void;
  onApplyGlobal: () => void;
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
  canApplyGlobally,
  saving,
  error,
  onSavePersonal,
  onPromote,
  onApplyGlobal,
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
    <motion.div
      data-span-editor="true"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-xl border-t border-border bg-card p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onExpandLeft}
            disabled={!canExpandLeft}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-30"
          >
            <CaretLeft size={14} /> Mở rộng
          </button>
          <span className="text-xs text-muted-foreground">
            Chọn nhiều chữ liền nhau để tạo cụm từ điển mới
          </span>
          <button
            type="button"
            onClick={onExpandRight}
            disabled={!canExpandRight}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-30"
          >
            Mở rộng <CaretRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-[2.5rem_1fr] items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-muted-foreground">zw</span>
          <span className="flex items-center gap-2">
            <span className="font-medium">{chinese}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(chinese)}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              title="Sao chép"
            >
              <Copy size={14} />
            </button>
          </span>

          <label htmlFor="span-editor-hv" className="text-muted-foreground">
            hv
          </label>
          <input
            id="span-editor-hv"
            value={hanViet}
            onChange={(e) => onHanVietChange(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />

          <label htmlFor="span-editor-hv-cap" className="text-muted-foreground">
            HV
          </label>
          <input
            id="span-editor-hv-cap"
            value={hanVietCapitalized}
            onChange={(e) => onHanVietCapitalizedChange(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Tr (các bản dịch, đầu tiên là mặc định)</span>
          {candidates.length === 0 && (
            <span className="text-xs text-muted-foreground">Chưa có bản dịch nào.</span>
          )}
          {candidates.map((candidate, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
              <input
                value={candidate}
                onChange={(e) => updateCandidate(i, e.target.value)}
                className={`flex-1 rounded-md border bg-background px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  i === 0 ? "border-secondary font-medium" : "border-border"
                }`}
              />
              <button
                type="button"
                onClick={() => moveCandidate(i, -1)}
                disabled={i === 0}
                className="cursor-pointer px-1 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-30"
                title="Đưa lên"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => moveCandidate(i, 1)}
                disabled={i === candidates.length - 1}
                className="cursor-pointer px-1 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-30"
                title="Đưa xuống"
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => removeCandidate(i)}
                className="cursor-pointer px-1 text-destructive"
                title="Xóa"
              >
                <X size={14} />
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
              className="flex-1 rounded-md border border-dashed border-border bg-background px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <button
              type="button"
              onClick={addCandidate}
              className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              + Thêm
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Kiểu viết hoa</span>
          {(Object.keys(CAP_STYLE_LABEL) as CapStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => onCapStyleChange(style)}
              className={`cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors ${
                capStyle === style
                  ? "border-secondary bg-secondary text-white dark:text-neutral-900"
                  : "border-border hover:bg-muted"
              }`}
            >
              {CAP_STYLE_LABEL[style]}
            </button>
          ))}
        </div>

        {reuseEntries.length > 0 && (
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Name trong kho</span>
            {reuseEntries.map((entry) => (
              <div
                key={entry.chineseText}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1"
              >
                <span className="truncate">
                  {entry.chineseText} → {entry.vietnameseText.split("/")[0]}
                </span>
                <button
                  type="button"
                  onClick={() => onReuseEntry(entry)}
                  className="shrink-0 cursor-pointer rounded-md border border-border px-2 py-0.5 hover:bg-muted"
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
            className="cursor-pointer rounded-md bg-secondary px-3 py-2 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-900"
          >
            {saving ? "Đang lưu…" : "Lưu riêng"}
          </button>
          {canPromote && (
            <button
              type="button"
              onClick={onPromote}
              disabled={saving}
              className="cursor-pointer rounded-md border border-border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-muted"
            >
              Thêm vào từ điển chung
            </button>
          )}
          {canApplyGlobally && (
            <button
              type="button"
              onClick={onApplyGlobal}
              disabled={saving}
              className="cursor-pointer rounded-md border border-accent px-3 py-2 text-accent disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent/10"
              title="Áp dụng cho mọi truyện, không chỉ truyện này"
            >
              Áp dụng cho tất cả truyện
            </button>
          )}
          <Link
            href={`/novels/${novelSlug}/overrides`}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Quản lý
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-muted"
          >
            Hủy
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cụm dài hơn tạo một mục từ điển riêng, không xóa các mục ngắn hơn -- chúng vẫn áp dụng ở
          nơi khác.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </motion.div>
  );
}
