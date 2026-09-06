import { redirect } from "next/navigation";
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin-only: browse the audit trail written by src/lib/adminActivity.ts
// (novel add/delete, dictionary edits, promotions, re-fetches, rate-limit
// denials) -- see the planning doc's section 5. Same auth-gate/pagination
// pattern as /admin/dictionary. Live app state -- never statically
// prerender.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/activity");
  }
  if (!isAdmin(session.user.role)) {
    redirect("/");
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [entries, total] = await Promise.all([
    prisma.adminActivityLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true } } },
    }),
    prisma.adminActivityLog.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Nhật ký hoạt động quản trị</h1>
      <p className="text-sm text-neutral-500">
        Ghi lại hành động quản trị/nhúng truyện -- xem{" "}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">src/lib/adminActivity.ts</code>.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-400">Chưa có hoạt động nào.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{entry.action}</span>
                <span className="text-xs text-neutral-400">
                  {entry.createdAt.toLocaleString("vi-VN")}
                </span>
              </div>
              <span className="text-neutral-500">
                {entry.user?.email ?? "(ẩn danh)"}
                {entry.targetType && entry.targetId && (
                  <>
                    {" "}
                    → {entry.targetType}:{entry.targetId}
                  </>
                )}
              </span>
              {entry.metadata !== null && entry.metadata !== undefined && (
                <pre className="overflow-x-auto rounded bg-neutral-100 p-2 text-xs text-neutral-500 dark:bg-neutral-800">
                  {JSON.stringify(entry.metadata)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-400">
            Trang {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`/admin/activity?page=${page - 1}`} className="underline">
                ← Trước
              </a>
            )}
            {page < totalPages && (
              <a href={`/admin/activity?page=${page + 1}`} className="underline">
                Sau →
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
