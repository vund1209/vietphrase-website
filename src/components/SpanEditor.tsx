"use client";

// The editable box for a selected span of one or more adjacent tokens --
// modeled after sangtacviet.com's per-phrase editor (hv/HV/zw/Tr fields,
// expand-selection arrows, manage/promote actions). See ChapterReader.tsx
// for the selection state this renders and docs/ARCHITECTURE.md "User
// management and per-word overrides" for the personal-vs-shared write
// paths this calls into.
import Link from "next/link";

interface SpanEditorProps {
  novelSlug: string;
  /** Raw Chinese text of the current span (the `zw` field). */
  chinese: string;
  hanViet: string;
  onHanVietChange: (value: string) => void;
  hanVietCapitalized: string;
  onHanVietCapitalizedChange: (value: string) => void;
  translation: string;
  onTranslationChange: (value: string) => void;
  canExpandLeft: boolean;
  canExpandRight: boolean;
  onExpandLeft: () => void;
  onExpandRight: () => void;
  canPromote: boolean;
  saving: boolean;
  error: string | null;
  onSavePersonal: () => void;
  onPromote: () => void;
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
  canExpandLeft,
  canExpandRight,
  onExpandLeft,
  onExpandRight,
  canPromote,
  saving,
  error,
  onSavePersonal,
  onPromote,
  onClose,
}: SpanEditorProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
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

          <label htmlFor="span-editor-tr" className="text-neutral-500">
            Tr
          </label>
          <input
            id="span-editor-tr"
            autoFocus
            value={translation}
            onChange={(e) => onTranslationChange(e.target.value)}
            placeholder="bản dịch/lựa chọn khác/..."
            className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>

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
