// Saves a signed-in reader's "continue reading" position for a novel.
// Auth required -- an anonymous reader's progress lives entirely
// client-side (IndexedDB, see src/lib/clientSync.ts) and never reaches
// this route at all; see ReadingProgressPing.tsx and prisma/schema.prisma's
// ReadingProgress model for why it's userId-scoped now.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

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

  const userId = Number(session.user.id);
  await prisma.readingProgress.upsert({
    where: { userId_novelId: { userId, novelId: novel.id } },
    create: { userId, novelId: novel.id, chapterNumber },
    update: { chapterNumber },
  });

  return Response.json({ ok: true });
}
