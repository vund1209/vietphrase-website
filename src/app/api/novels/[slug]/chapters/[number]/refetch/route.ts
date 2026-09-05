// Admin-only: clear a chapter's cached rawText so the next view re-scrapes
// it from source instead of reusing what might now be stale content (see
// docs/PLANNED_FEATURES.md "Manual re-fetch"). Doesn't scrape itself --
// the existing lazy-scrape branch in getOrTranslateChapter
// (src/lib/novels.ts) already does the right thing once rawText is null.
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string; number: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return Response.json({ error: "Admin role required" }, { status: 403 });
  }

  const { slug, number } = await params;
  const chapterNumber = Number(number);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return Response.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true } });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  const chapter = await prisma.chapter.findUnique({
    where: { novelId_chapterNumber: { novelId: novel.id, chapterNumber } },
  });
  if (!chapter) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  await prisma.chapter.update({
    where: { id: chapter.id },
    data: { rawText: null, status: "PENDING", scrapedAt: null },
  });

  return Response.json({ ok: true });
}
