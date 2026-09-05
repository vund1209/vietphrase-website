"use client";

// Catches an unhandled error anywhere under the root layout (expected,
// handled failures like a bad scrape already render their own inline
// message -- see e.g. src/app/novels/[slug]/chapters/[number]/page.tsx's
// ScrapeFailedError branch -- this is the fallback for everything else,
// e.g. a DB connection drop).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Đã có lỗi xảy ra</h1>
      <p className="text-sm text-neutral-500">{error.message || "Lỗi không rõ."}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
      >
        Thử lại
      </button>
    </main>
  );
}
