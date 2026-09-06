"use client";

// Replaces the old always-visible "Thêm truyện mới" panel, which competed
// with the library grid for attention and pushed it further down the
// page. Wraps AddBookForm unchanged -- only the shell (trigger + dialog)
// is new.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "@phosphor-icons/react";
import { AddBookForm } from "./AddBookForm";

export function AddBookModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Thêm truyện mới</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Đóng"
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Dán URL trang mục lục (danh sách chương) của một truyện trên trang web tiếng
                Trung. Hệ thống dùng bộ trích xuất chung -- chưa được kiểm chứng trên trang thật
                nào, có thể thất bại với một số trang.
              </p>
              <AddBookForm />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
