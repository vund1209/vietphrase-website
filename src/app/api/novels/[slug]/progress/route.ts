// Saves a reader's "continue reading" position for a novel. No auth --
// see prisma/schema.prisma's ReadingProgress model for why this is
// cookie-scoped rather than tied to a User account.
import { prisma } from "@/lib/prisma";
import { getOrCreateReaderId } from "@/lib/readerId";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true } });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const chapterNumber = Number(body?.chapterNumber);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return Response.json({ error: "chapterNumber must be a positive integer" }, { status: 400 });
  }

  const readerId = await getOrCreateReaderId();
  await prisma.readingProgress.upsert({
    where: { readerId_novelId: { readerId, novelId: novel.id } },
    create: { readerId, novelId: novel.id, chapterNumber },
    update: { chapterNumber },
  });

  return Response.json({ ok: true });
}
