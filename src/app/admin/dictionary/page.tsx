import { redirect } from "next/navigation";
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GlobalOverrideDeactivateButton } from "@/components/GlobalOverrideDeactivateButton";

// Admin-only: browse/search/deactivate GlobalWordOverride entries (see
// prisma/schema.prisma and docs/PLANNED_FEATURES.md). Live app state --
// never statically prerender.
export const dynamic = "force-dynamic";

const CAP_STYLE_LABEL: Record<string, string> = {
  NONE: "Không",
  FIRST_LETTER: "Hoa chữ đầu",
  ALL_WORDS: "Hoa toàn bộ",
};

export default async function AdminDictionaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/dictionary");
  }
  if (!isAdmin(session.user.role)) {
    redirect("/");
  }

  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const entries = await prisma.globalWordOverride.findMany({
    where: query ? { chineseText: { contains: query } } : {},
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Từ điển chung (áp dụng cho mọi truyện)</h1>
      <p className="text-sm text-neutral-500">
        Các mục này được kiểm tra trước từ điển gốc nhưng sau từ đã sửa riêng của từng truyện --
        xem <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">src/lib/overrides.ts</code>.
        Thêm mục mới bằng nút &quot;Áp dụng cho tất cả truyện&quot; khi sửa một từ trong lúc đọc.
      </p>

      <form method="GET" action="/admin/dictionary" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Tìm theo chữ Hán…"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Tìm
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-400">Chưa có mục nào.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 py-3">
              <span className={entry.isActive ? "" : "text-neutral-400 line-through"}>
                <span className="font-medium">{entry.chineseText}</span>
                <span className="mx-2 text-neutral-400">→</span>
                <span>{entry.vietnameseText}</span>
                <span className="ml-2 text-xs text-neutral-400">
                  ({CAP_STYLE_LABEL[entry.capStyle] ?? entry.capStyle})
                </span>
              </span>
              <GlobalOverrideDeactivateButton id={entry.id} isActive={entry.isActive} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
