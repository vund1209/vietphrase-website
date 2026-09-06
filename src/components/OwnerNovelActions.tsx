"use client";

// Owner-visible actions area for a USER_CREATED novel -- parallel to (not
// merged with) the existing admin-only AdminActionsMenu: scraped novels
// stay admin-managed, user-created ones become owner-managed. See the
// planning doc's section 8.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link as LinkIcon, PencilSimple, Plus, UploadSimple } from "@phosphor-icons/react";
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
  const [urlImportOpen, setUrlImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ bytesLoaded: number; bytesTotal: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(novelTitle);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

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

  async function importFromUrl() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setUrlError(null);
    setImportProgress(null);
    try {
      const res = await fetch(`/api/novels/${novelSlug}/chapters/import-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      if (!res.ok || !res.body) {
        const body: { error?: string } | null = await res.json().catch(() => null);
        setUrlError(body?.error ?? "Nhập từ URL thất bại.");
        return;
      }

      // Streamed newline-delimited JSON (see the route's own doc
      // comment) -- headers/status are already committed by the time
      // this starts, so a failure partway through arrives as the last
      // line's {type: "error"}, not as an HTTP error status.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let added: number | null = null;
      let streamError: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === "progress") setImportProgress({ bytesLoaded: msg.bytesLoaded, bytesTotal: msg.bytesTotal });
          else if (msg.type === "done") added = msg.added;
          else if (msg.type === "error") streamError = msg.error;
        }
      }

      if (streamError || added === null) {
        setUrlError(streamError ?? "Nhập từ URL thất bại.");
        return;
      }
      showToast(`Đã nhập ${added} chương.`);
      setUrlImportOpen(false);
      setImportUrl("");
      router.refresh();
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  async function renameNovel() {
    if (!newTitle.trim() || newTitle.trim() === novelTitle) return;
    setRenaming(true);
    setRenameError(null);
    const res = await fetch(`/api/novels/${novelSlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setRenaming(false);
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setRenameError(body?.error ?? "Không thể đổi tên.");
      return;
    }
    showToast("Đã đổi tên truyện.");
    setRenameOpen(false);
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
      <button
        type="button"
        onClick={() => setUrlImportOpen(true)}
        disabled={importing}
        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LinkIcon size={16} /> Nhập từ URL
      </button>
      <button
        type="button"
        onClick={() => {
          setNewTitle(novelTitle);
          setRenameError(null);
          setRenameOpen(true);
        }}
        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <PencilSimple size={16} /> Đổi tên
      </button>
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

      {urlImportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setUrlImportOpen(false);
          }}
        >
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-xl">
            <h2 className="font-display text-lg font-semibold">Nhập chương từ URL</h2>
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://mega.nz/file/..."
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">Hỗ trợ: mega.nz</p>
            {importProgress && (
              <div className="flex flex-col gap-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-secondary transition-[width]"
                    style={{
                      width: `${Math.min(100, (importProgress.bytesLoaded / importProgress.bytesTotal) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {(importProgress.bytesLoaded / 1024 / 1024).toFixed(1)}MB /{" "}
                  {(importProgress.bytesTotal / 1024 / 1024).toFixed(1)}MB
                </p>
              </div>
            )}
            {urlError && <p className="text-sm text-destructive">{urlError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setUrlImportOpen(false)}
                className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={importFromUrl}
                disabled={importing || !importUrl.trim()}
                className="cursor-pointer rounded-md bg-secondary px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-900"
              >
                {importing
                  ? importProgress
                    ? `Đang tải… ${Math.round((importProgress.bytesLoaded / importProgress.bytesTotal) * 100)}%`
                    : "Đang nhập…"
                  : "Nhập"}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRenameOpen(false);
          }}
        >
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-xl">
            <h2 className="font-display text-lg font-semibold">Đổi tên truyện</h2>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Tên truyện"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={renameNovel}
                disabled={renaming || !newTitle.trim() || newTitle.trim() === novelTitle}
                className="cursor-pointer rounded-md bg-secondary px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-900"
              >
                {renaming ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
