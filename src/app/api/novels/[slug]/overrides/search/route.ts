// Lightweight "reuse an existing entry" lookup: lets the span editor show
// a handful of existing shared dictionary entries related to the current
// selection (both tracks -- Name and NovelWordOverride), so a
// reader/editor can check what's already defined before creating a
// near-duplicate. Read-only, no auth -- mirrors the public nature of the
// shared dictionary itself.
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true } });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return Response.json({ entries: [] });
  }

  const select = { chineseText: true, vietnameseText: true, capStyle: true } as const;
  const [nameEntries, phraseEntries] = await Promise.all([
    prisma.name.findMany({
      where: { novelId: novel.id, isActive: true, chineseText: { contains: q } },
      orderBy: { phraseLength: "desc" },
      take: 8,
      select,
    }),
    prisma.novelWordOverride.findMany({
      where: { novelId: novel.id, isActive: true, chineseText: { contains: q } },
      orderBy: { phraseLength: "desc" },
      take: 8,
      select,
    }),
  ]);

  const entries = [
    ...nameEntries.map((e) => ({ ...e, track: "name" as const })),
    ...phraseEntries.map((e) => ({ ...e, track: "phrase" as const })),
  ].slice(0, 8);

  return Response.json({ entries });
}
