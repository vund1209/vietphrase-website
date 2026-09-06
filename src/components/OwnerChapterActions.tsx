"use client";

// Owner/admin-only chapter management for a USER_CREATED novel -- edit
// this chapter's title/content, or delete it (which renumbers every
// subsequent chapter down by one, see DELETE .../chapters/[number]/route.ts).
// Parallel to (not merged with) the existing admin-only RefetchChapterButton,
// which only makes sense for a SCRAPED novel. See the planning doc's
// section 8.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple, Trash } from "@phosphor-icons/react";
import { useToast } from "./ToastProvider";

interface OwnerChapterActionsProps {
  novelSlug: string;
  chapterNumber: number;
  initialTitle: string;
  initialRawText: string;
}

export function OwnerChapterActions({
  novelSlug,
  chapterNumber,
  initialTitle,
  initialRawText,
}: OwnerChapterActionsProps) {
  const router = useRouter();
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [rawText, setRawText] = useState(initialRawText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/novels/${novelSlug}/chapters/${chapterNumber}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, rawText }),
    });
    setSaving(false);
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Lưu thất bại.");
      return;
    }
    showToast("Đã lưu chương.");
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Xóa chương này? Các chương sau sẽ dịch số xuống một bậc.")) return;
    const res = await fetch(`/api/novels/${novelSlug}/chapters/${chapterNumber}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      showToast(body?.error ?? "Xóa thất bại.", "error");
      return;
    }
    showToast("Đã xóa chương.");
    router.push(`/novels/${novelSlug}`);
    router.refresh();
  }

  return (
    <>
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          <PencilSimple size={14} /> Sửa
        </button>
        <button
          type="button"
          onClick={remove}
          className="flex cursor-pointer items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash size={14} /> Xóa
        </button>
      </span>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(false);
          }}
        >
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-xl">
            <h2 className="font-display text-lg font-semibold">Sửa chương {chapterNumber}</h2>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tiêu đề chương"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              placeholder="Nội dung chương"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="cursor-pointer rounded-md bg-secondary px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-900"
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
