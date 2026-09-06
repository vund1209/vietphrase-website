import Link from "next/link";

// Next's file-convention 404 -- catches any unmatched route or an explicit
// notFound() call (e.g. a missing novel/chapter). Previously absent, so
// both cases fell through to Next's generic default page. Same shell/style
// as error.tsx's fallback UI.
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="text-sm text-neutral-500">Trang bạn tìm không tồn tại hoặc đã bị xóa.</p>
      <Link
        href="/"
        className="rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
      >
        Về trang chủ
      </Link>
    </main>
  );
}
