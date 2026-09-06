"use client";

// Quick type-to-search tag picker -- reuses this session's established
// click-outside-to-close dropdown pattern (see AdminActionsMenu.tsx)
// rather than inventing a new interaction shape. `allTags` is loaded once
// by the caller (small/bounded preset list) and filtered here entirely
// client-side, no per-keystroke request. See the planning doc's section 13.
import { useEffect, useRef, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import type { TagOption } from "@/lib/tags";

interface TagComboboxProps {
  allTags: TagOption[];
  excludeIds: ReadonlySet<number>;
  onSelect: (tag: TagOption) => void;
  disabled?: boolean;
  triggerLabel?: string;
}

export function TagCombobox({
  allTags,
  excludeIds,
  onSelect,
  disabled,
  triggerLabel = "Thêm tag",
}: TagComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = allTags
    .filter((t) => !excludeIds.has(t.id))
    .filter((t) => !q || t.name.toLowerCase().includes(q))
    .slice(0, 30);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={12} weight="bold" /> {triggerLabel}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 flex w-56 flex-col gap-1 rounded-md border border-border bg-card p-2 shadow-lg">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tag…"
            className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <div className="max-h-56 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">Không tìm thấy tag.</p>
            ) : (
              matches.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    onSelect(tag);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted"
                >
                  <span>{tag.name}</span>
                  {tag.category && (
                    <span className="text-[10px] text-muted-foreground">{tag.category}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
