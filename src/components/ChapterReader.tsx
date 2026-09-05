"use client";

// Interactive, per-word reader: every translated token is its own
// clickable span. Clicking one opens a small editor that saves a
// *private* override for that reader only (see
// docs/ARCHITECTURE.md "User management and per-word overrides") --
// this never touches the shared translation everyone else sees.
//
// Only rendered when the server already resolved per-word tokens for a
// signed-in reader (see src/lib/novels.ts's getOrTranslateChapter) --
// an anonymous reader gets the plain cached text instead, so this
// component doesn't need to handle a signed-out state itself.
import { useState } from "react";
import type { DisplayToken } from "@/lib/tokenizer";

interface ChapterReaderProps {
  novelSlug: string;
  lines: DisplayToken[][];
}

interface Selection {
  line: number;
  index: number;
}

export function ChapterReader({ novelSlug, lines }: ChapterReaderProps) {
  const [tokenLines, setTokenLines] = useState(lines);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedToken = selected ? tokenLines[selected.line]?.[selected.index] : null;

  function openEditor(line: number, index: number) {
    const token = tokenLines[line][index];
    setSelected({ line, index });
    setDraft(token.vietnamese);
    setError(null);
  }

  function closeEditor() {
    setSelected(null);
    setError(null);
  }

  async function handleSave() {
    if (!selectedToken) return;
    const chineseText = selectedToken.chinese;
    const vietnameseText = draft.trim();
    if (!vietnameseText) {
      setError("Bản dịch không được để trống.");
      return;
    }

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/novels/${novelSlug}/overrides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chineseText, vietnameseText }),
    });
    setSaving(false);

    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Lưu thất bại.");
      return;
    }

    // Reflect the edit everywhere this exact Chinese phrase appears in
    // the currently-rendered chapter, not just the clicked instance --
    // it's the same personal override either way.
    setTokenLines((prev) =>
      prev.map((tline) =>
        tline.map((t) => (t.chinese === chineseText ? { ...t, vietnamese: vietnameseText } : t))
      )
    );
    setSelected(null);
  }

  return (
    <article className="text-lg leading-relaxed">
      {tokenLines.map((line, lineIndex) => (
        <p key={lineIndex} className="mb-4">
          {line.length === 0
            ? " "
            : line.map((token, tokenIndex) => (
                <span key={tokenIndex} className="group relative inline-block">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => openEditor(lineIndex, tokenIndex)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEditor(lineIndex, tokenIndex);
                      }
                    }}
                    className="cursor-pointer rounded px-0.5 hover:bg-yellow-100 dark:hover:bg-yellow-900"
                  >
                    {token.vietnamese}{" "}
                  </span>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-neutral-100 dark:text-neutral-900">
                    {token.chinese} · {token.hanViet}
                  </span>
                </span>
              ))}
        </p>
      ))}

      {selected && selectedToken && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <div className="text-sm text-neutral-500">
              Chữ Hán: <span className="font-medium">{selectedToken.chinese}</span> · Hán Việt:{" "}
              <span className="font-medium">{selectedToken.hanViet}</span> (sửa chỉ áp dụng cho
              riêng bạn)
            </div>
            <div className="flex gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
              >
                Hủy
              </button>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </article>
  );
}
