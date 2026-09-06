"use client";

// Quick chapter navigation from inside the reader -- previously the only
// way to jump to another chapter was back to the novel page's full list,
// real friction on a book with hundreds/thousands of chapters (the one
// embedded book runs 1208). novel.chapters is already loaded server-side
// for this page's existing prev/next logic (see the chapter page), so
// this needs no new fetch -- list content only renders once the panel is
// actually opened, so it doesn't add DOM weight to every chapter view.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, m } from "framer-motion";
import { ListBullets, X } from "@phosphor-icons/react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { FADE_TRANSITION, STANDARD_TRANSITION } from "@/lib/motion";

interface ChapterListItem {
  chapterNumber: number;
  title: string;
  status: string;
}

interface Props {
  novelSlug: string;
  currentChapter: number;
  chapters: ChapterListItem[];
}

export function ChapterTocPanel({ novelSlug, currentChapter, chapters }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jumpTo, setJumpTo] = useState("");
  const activeRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);
  // createPortal's target (document.body) only exists client-side --
  // evaluating it during the server render throws "document is not
  // defined". Delay the portal until after mount, same pattern as
  // ThemeToggle's isDark/null-until-mounted split.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Same hydration-safe client-only pattern as ThemeToggle's isDark split.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    // Wait a frame for the panel to mount before scrolling to the active item.
    const id = requestAnimationFrame(() => {
      activeRef.current?.scrollIntoView({ block: "center" });
    });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      cancelAnimationFrame(id);
    };
  }, [open]);

  function handleJump(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jumpTo);
    if (!Number.isInteger(n) || n < 1 || n > chapters.length) return;
    setOpen(false);
    router.push(`/novels/${novelSlug}/chapters/${n}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted"
      >
        <ListBullets size={16} /> Mục lục
      </button>
      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <>
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE_TRANSITION}
                className="fixed inset-0 z-50 bg-black/50"
                onClick={() => setOpen(false)}
              />
              <m.div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="chapter-toc-title"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={STANDARD_TRANSITION}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-xl"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border p-4">
                  <h2 id="chapter-toc-title" className="font-display text-lg font-semibold">
                    Mục lục
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Đóng"
                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                </div>
                <form
                  onSubmit={handleJump}
                  className="flex items-center gap-2 border-b border-border p-3"
                >
                  <label htmlFor="chapter-jump" className="shrink-0 text-sm text-muted-foreground">
                    Đến chương
                  </label>
                  <input
                    id="chapter-jump"
                    type="number"
                    min={1}
                    max={chapters.length}
                    value={jumpTo}
                    onChange={(e) => setJumpTo(e.target.value)}
                    className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-md border border-border px-2 py-1 text-sm hover:bg-muted"
                  >
                    Đi
                  </button>
                </form>
                <div className="flex-1 overflow-y-auto p-2">
                  {chapters.map((chapter) => {
                    const isActive = chapter.chapterNumber === currentChapter;
                    return (
                      <Link
                        key={chapter.chapterNumber}
                        ref={isActive ? activeRef : undefined}
                        href={`/novels/${novelSlug}/chapters/${chapter.chapterNumber}`}
                        onClick={() => setOpen(false)}
                        className={`block rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? "border-l-accent bg-accent/20 font-medium text-accent"
                            : "border-l-transparent hover:bg-muted"
                        }`}
                      >
                        Chương {chapter.chapterNumber}: {chapter.title}
                      </Link>
                    );
                  })}
                </div>
              </m.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
