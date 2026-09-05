import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, isEditorOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PromoteOverrideButton } from "@/components/PromoteOverrideButton";

// A reader's own private word overrides for one novel, with a promote
// action for editors. See docs/ARCHITECTURE.md "User management and
// per-word overrides".
export const dynamic = "force-dynamic";

export default async function NovelOverridesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=/novels/${slug}/overrides`);
  }

  const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true, title: true } });
  if (!novel) notFound();

  const overrides = await prisma.userWordOverride.findMany({
    where: { novelId: novel.id, userId: Number(session.user.id) },
    orderBy: { updatedAt: "desc" },
  });

  const isEditor = isEditorOrAdmin(session.user.role);

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
      <Link href={`/novels/${slug}`} className="text-sm text-neutral-500 hover:underline">
        ← {novel.title}
      </Link>
      <h1 className="text-xl font-semibold">Từ đã sửa của bạn</h1>
      <p className="text-sm text-neutral-500">
        Những từ này chỉ hiển thị cho riêng bạn khi đọc truyện.
        {isEditor && " Với vai trò biên tập, bạn có thể áp dụng cho mọi người đọc."}
      </p>

      {overrides.length === 0 ? (
        <p className="text-neutral-500">
          Bạn chưa sửa từ nào. Bấm vào một từ khi đang đọc chương để sửa.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
          {overrides.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-4 py-3">
              <span>
                <span className="font-medium">{o.chineseText}</span>
                <span className="mx-2 text-neutral-400">→</span>
                <span>{o.vietnameseText}</span>
              </span>
              {isEditor && (
                <PromoteOverrideButton
                  novelSlug={slug}
                  chineseText={o.chineseText}
                  vietnameseText={o.vietnameseText}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
