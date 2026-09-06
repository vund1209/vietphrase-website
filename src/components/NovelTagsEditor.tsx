"use client";

// Novel-page tag editor -- any logged-in reader may add a preset tag;
// removing one requires being the reader who added it, or an admin (see
// src/app/api/novels/[slug]/tags/[tagId]/route.ts and the planning doc's
// section 13). Anonymous visitors see the read-only chips only, no add
// control, since embedding requires an account.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TagChip } from "./TagChip";
import { TagCombobox } from "./TagCombobox";
import { useToast } from "./ToastProvider";
import type { TagOption } from "@/lib/tags";

export interface NovelTagItem {
  tagId: number;
  name: string;
  canRemove: boolean;
}

interface NovelTagsEditorProps {
  novelSlug: string;
  novelTags: NovelTagItem[];
  allTags: TagOption[];
  isSignedIn: boolean;
}

export function NovelTagsEditor({ novelSlug, novelTags, allTags, isSignedIn }: NovelTagsEditorProps) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<number | null>(null);

  async function handleAdd(tag: TagOption) {
    setPendingId(tag.id);
    try {
      const res = await fetch(`/api/novels/${novelSlug}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error ?? "Không thể thêm tag.", "error");
        return;
      }
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(item: NovelTagItem) {
    setPendingId(item.tagId);
    try {
      const res = await fetch(`/api/novels/${novelSlug}/tags/${item.tagId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error ?? "Không thể bỏ tag.", "error");
        return;
      }
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (novelTags.length === 0 && !isSignedIn) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {novelTags.map((item) => (
        <TagChip
          key={item.tagId}
          label={item.name}
          removing={pendingId === item.tagId}
          onRemove={item.canRemove ? () => handleRemove(item) : undefined}
        />
      ))}
      {isSignedIn && (
        <TagCombobox
          allTags={allTags}
          excludeIds={new Set(novelTags.map((t) => t.tagId))}
          onSelect={handleAdd}
          disabled={pendingId !== null}
        />
      )}
    </div>
  );
}
