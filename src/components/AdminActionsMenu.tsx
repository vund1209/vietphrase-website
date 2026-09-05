"use client";

// Consolidates the novel page's admin-only actions (metadata refresh,
// new-chapter check, delete) behind a single icon trigger instead of three
// always-visible buttons competing for attention next to the title.
import { useEffect, useRef, useState } from "react";
import { DotsThreeVertical } from "@phosphor-icons/react";
import { RefreshMetadataButton } from "./RefreshMetadataButton";
import { CheckNewChaptersButton } from "./CheckNewChaptersButton";
import { DeleteNovelButton } from "./DeleteNovelButton";

interface Props {
  novelSlug: string;
  novelTitle: string;
}

export function AdminActionsMenu({ novelSlug, novelTitle }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Thao tác quản trị"
        aria-expanded={open}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
      >
        <DotsThreeVertical size={20} weight="bold" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 flex w-max flex-col gap-1 rounded-md border border-border bg-card p-2 shadow-lg">
          <RefreshMetadataButton novelSlug={novelSlug} />
          <CheckNewChaptersButton novelSlug={novelSlug} />
          <div className="my-1 border-t border-border" />
          <DeleteNovelButton novelSlug={novelSlug} novelTitle={novelTitle} redirectTo="/" />
        </div>
      )}
    </div>
  );
}
