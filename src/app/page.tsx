import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">VietPhrase</h1>
      <p className="text-neutral-600 dark:text-neutral-300">
        Trang đọc truyện dịch Trung → Việt theo kỹ thuật VietPhrase. Xem{" "}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
          docs/ARCHITECTURE.md
        </code>{" "}
        để biết kiến trúc tổng thể.
      </p>
      <div className="flex flex-col gap-3">
        <Link
          href="/translate"
          className="rounded-md border border-neutral-300 p-4 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          <div className="font-medium">Dịch nhanh</div>
          <div className="text-sm text-neutral-500">
            Dán văn bản tiếng Trung, nhận bản dịch VietPhrase ngay lập tức. Đã hoạt động.
          </div>
        </Link>
        <div className="rounded-md border border-dashed border-neutral-300 p-4 text-neutral-400 dark:border-neutral-700">
          <div className="font-medium">Thư viện truyện (sắp có)</div>
          <div className="text-sm">
            Thêm truyện bằng URL, đọc theo chương — cần kết nối Postgres trước
            (xem docs/ARCHITECTURE.md).
          </div>
        </div>
      </div>
    </main>
  );
}
