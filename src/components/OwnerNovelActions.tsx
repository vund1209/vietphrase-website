"use client";

// Owner-visible actions area for a USER_CREATED novel -- parallel to (not
// merged with) the existing admin-only AdminActionsMenu: scraped novels
// stay admin-managed, user-created ones become owner-managed. See the
// planning doc's section 8.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UploadSimple } from "@phosphor-icons/react";
import { DeleteNovelButton } from "./DeleteNovelButton";
import { useToast } from "./ToastProvider";

interface OwnerNovelActionsProps {
  novelSlug: string;
  novelTitle: string;
}

export function OwnerNovelActions({ novelSlug, novelTitle }: OwnerNovelActionsProps) {
  const router = useRouter();
  const showToast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addChapter() {
    if (!title.trim() || !rawText.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/novels/${novelSlug}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), rawText: rawText.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Không thể thêm chương.");
      return;
    }
    showToast("Đã thêm chương.");
    setAddOpen(false);
    setTitle("");
    setRawText("");
    router.refresh();
  }

  async function importTxt(file: File) {
    setImporting(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/novels/${novelSlug}/chapters/import`, {
      method: "POST",
      body: formData,
    });
    setImporting(false);
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      showToast(body?.error ?? "Nhập file thất bại.", "error");
      return;
    }
    const data: { added: number } = await res.json();
    showToast(`Đã nhập ${data.added} chương.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <Plus size={16} /> Thêm chương
      </button>
      <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
        <UploadSimple size={16} />
        {importing ? "Đang nhập…" : "Nhập file .txt"}
        <input
          type="file"
          accept=".txt"
          className="hidden"
          disabled={importing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) importTxt(file);
          }}
        />
      </label>
      <DeleteNovelButton novelSlug={novelSlug} novelTitle={novelTitle} redirectTo="/" />

      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddOpen(false);
          }}
        >
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-xl">
            <h2 className="font-display text-lg font-semibold">Thêm chương mới</h2>
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
                onClick={() => setAddOpen(false)}
                className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={addChapter}
                disabled={saving}
                className="cursor-pointer rounded-md bg-secondary px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-900"
              >
                {saving ? "Đang lưu…" : "Thêm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
