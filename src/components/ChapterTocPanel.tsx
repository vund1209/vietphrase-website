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
import { AnimatePresence, motion } from "framer-motion";
import { ListBullets, X } from "@phosphor-icons/react";

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
      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-black/50"
                onClick={() => setOpen(false)}
              />
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-xl"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border p-4">
                  <h2 className="font-display text-lg font-semibold">Mục lục</h2>
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
                        className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                          isActive ? "bg-accent/20 font-medium" : "hover:bg-muted"
                        }`}
                      >
                        Chương {chapter.chapterNumber}: {chapter.title}
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
