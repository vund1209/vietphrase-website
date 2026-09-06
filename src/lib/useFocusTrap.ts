"use client";

// Focus trap + return-focus-on-close for a modal/panel overlay -- see
// the planning doc's section 11 (accessibility pass on AddBookModal,
// ChapterTocPanel, SpanEditor: these already close on Escape/backdrop-
// click, but previously did nothing about keyboard focus while open or
// where focus goes back to after closing).
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Attach `containerRef` to the modal/panel's outermost element and call
 * this with `open` reflecting its visibility. While open: moves focus
 * into the container (first focusable element, falling back to the
 * container itself) and traps Tab/Shift+Tab cycling within it. On close:
 * restores focus to whatever was focused before the panel opened.
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, open: boolean) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    const focusables = () =>
      container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];

    const first = focusables()[0] ?? container;
    first?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !container) return;
      const elements = focusables();
      if (elements.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = elements[0];
      const lastEl = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, containerRef]);
}
