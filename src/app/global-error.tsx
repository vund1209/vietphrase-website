"use client";

// Catches an error thrown by the root layout itself -- a rarer case than
// src/app/error.tsx, but Next.js requires a separate file for it because
// this one has to render its own <html>/<body> (the layout that would
// normally provide them is exactly what failed). Inline styles only:
// globals.css's Tailwind classes are linked from the root layout's own
// <head>, which never runs on this path.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body>
        <main
          style={{
            maxWidth: 480,
            margin: "96px auto",
            padding: 24,
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1>Đã có lỗi xảy ra</h1>
          <p style={{ color: "#666" }}>{error.message || "Lỗi không rõ."}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 6,
              background: "#111",
              color: "#fff",
              border: "none",
            }}
          >
            Thử lại
          </button>
        </main>
      </body>
    </html>
  );
}
