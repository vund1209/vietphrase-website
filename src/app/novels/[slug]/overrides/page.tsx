import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, isEditorOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PromoteOverrideButton } from "@/components/PromoteOverrideButton";

// A reader's own private overrides for one novel -- phrase track
// (UserWordOverride) and name track (UserNameOverride) shown as two
// separate sections, with a promote action for editors. See
// docs/ARCHITECTURE.md "User management and per-word overrides".
export const dynamic = "force-dynamic";

interface OverrideRow {
  id: number;
  chineseText: string;
  vietnameseText: string;
}

function OverrideList({
  overrides,
  slug,
  track,
  isEditor,
}: {
  overrides: OverrideRow[];
  slug: string;
  track: "phrase" | "name";
  isEditor: boolean;
}) {
  if (overrides.length === 0) {
    return (
      <p className="text-neutral-500">
        Bạn chưa sửa {track === "name" ? "tên riêng" : "cụm từ"} nào. Bấm vào một từ khi đang đọc
        chương để sửa.
      </p>
    );
  }
  return (
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
              track={track}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

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

  const userId = Number(session.user.id);
  const [phraseOverrides, nameOverrides] = await Promise.all([
    prisma.userWordOverride.findMany({
      where: { novelId: novel.id, userId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.userNameOverride.findMany({
      where: { novelId: novel.id, userId },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const isEditor = isEditorOrAdmin(session.user.role);

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 p-6">
      <Link href={`/novels/${slug}`} className="text-sm text-neutral-500 hover:underline">
        ← {novel.title}
      </Link>
      <h1 className="text-xl font-semibold">Từ đã sửa của bạn</h1>
      <p className="text-sm text-neutral-500">
        Những từ này chỉ hiển thị cho riêng bạn khi đọc truyện. Cụm từ và tên riêng là hai từ điển
        tách biệt.
        {isEditor && " Với vai trò biên tập, bạn có thể áp dụng cho mọi người đọc."}
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Cụm từ</h2>
        <OverrideList overrides={phraseOverrides} slug={slug} track="phrase" isEditor={isEditor} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Tên riêng / Danh từ
        </h2>
        <OverrideList overrides={nameOverrides} slug={slug} track="name" isEditor={isEditor} />
      </section>
    </main>
  );
}
