"use client";

// Replaces the old always-visible "Thêm truyện mới" panel, which competed
// with the library grid for attention and pushed it further down the
// page. Wraps AddBookForm unchanged -- only the shell (trigger + dialog)
// is new.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Plus, X } from "@phosphor-icons/react";
import { AddBookForm } from "./AddBookForm";
import { CreateNovelForm } from "./CreateNovelForm";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { FADE_TRANSITION, STANDARD_TRANSITION } from "@/lib/motion";

interface AddBookModalProps {
  isSignedIn: boolean;
}

type Mode = "url" | "create";

export function AddBookModal({ isSignedIn }: AddBookModalProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("url");
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Embedding requires login (see POST /api/novels) -- an anonymous
  // visitor gets a login link instead of the modal, rather than opening
  // it and failing on submit. See the planning doc's section 5.
  if (!isSignedIn) {
    return (
      <Link
        href="/login?callbackUrl=/"
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <Plus size={16} weight="bold" /> Đăng nhập để thêm truyện
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm text-white transition-opacity hover:opacity-90 dark:text-neutral-900"
      >
        <Plus size={16} weight="bold" /> Thêm truyện
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE_TRANSITION}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <m.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-book-modal-title"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={STANDARD_TRANSITION}
              className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 id="add-book-modal-title" className="font-display text-lg font-semibold">
                  Thêm truyện mới
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
              <div className="mb-3 flex gap-1 rounded-md border border-border p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setMode("url")}
                  className={`flex-1 cursor-pointer rounded px-2 py-1 transition-colors ${
                    mode === "url" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  Nhúng từ URL
                </button>
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  className={`flex-1 cursor-pointer rounded px-2 py-1 transition-colors ${
                    mode === "create" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  Tạo truyện của bạn
                </button>
              </div>
              {/* Cross-fades between the two modes instead of an instant swap
                  -- see the planning doc's section 12 ("Tab switches fade
                  content in rather than hard-cutting"). mode="wait" holds
                  the exit animation of the old content until it finishes
                  before the new content enters, so they never overlap. */}
              <AnimatePresence mode="wait">
                {mode === "url" ? (
                  <m.div
                    key="url"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={FADE_TRANSITION}
                  >
                    <p className="mb-3 text-sm text-muted-foreground">
                      Dán URL trang mục lục (danh sách chương) của một truyện trên trang web tiếng
                      Trung. Hệ thống dùng bộ trích xuất chung -- chưa được kiểm chứng trên trang
                      thật nào, có thể thất bại với một số trang.
                    </p>
                    <AddBookForm />
                  </m.div>
                ) : (
                  <m.div
                    key="create"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={FADE_TRANSITION}
                  >
                    <p className="mb-3 text-sm text-muted-foreground">
                      Tạo một truyện do bạn tự viết hoặc nhập từ file .txt -- không cần URL nguồn.
                    </p>
                    <CreateNovelForm />
                  </m.div>
                )}
              </AnimatePresence>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
