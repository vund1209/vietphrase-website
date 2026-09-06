// Owner-only manual chapter add for a USER_CREATED novel -- see the
// planning doc's section 8. Appends at max(chapterNumber) + 1. Distinct
// from .../chapters/import/route.ts (.txt bulk import).
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwnerOrAdmin } from "@/lib/isOwnerOrAdmin";
import { stripDangerousMarkup } from "@/lib/sanitizeText";
import { detectSourceLanguage } from "@/lib/chapterChunking";
import { logActivity } from "@/lib/adminActivity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug } = await params;
  const novel = await prisma.novel.findUnique({
    where: { slug },
    select: { id: true, origin: true, addedByUserId: true },
  });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }
  if (novel.origin !== "USER_CREATED") {
    return Response.json({ error: "Only user-created novels can add chapters this way" }, { status: 400 });
  }
  if (!isOwnerOrAdmin(novel, session)) {
    return Response.json({ error: "Not the owner of this novel" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const rawTextRaw = typeof body?.rawText === "string" ? body.rawText.trim() : "";
  if (!title || !rawTextRaw) {
    return Response.json({ error: "title and rawText are both required" }, { status: 400 });
  }
  const rawText = stripDangerousMarkup(rawTextRaw);

  const last = await prisma.chapter.findFirst({
    where: { novelId: novel.id },
    orderBy: { chapterNumber: "desc" },
    select: { chapterNumber: true },
  });
  const chapterNumber = (last?.chapterNumber ?? 0) + 1;

  const chapter = await prisma.chapter.create({
    data: {
      novelId: novel.id,
      chapterNumber,
      title,
      originalTitle: title,
      rawText,
      sourceLanguage: detectSourceLanguage(rawText),
      status: "SCRAPED",
      scrapedAt: new Date(),
    },
  });

  await logActivity({
    userId: Number(session.user.id),
    action: "chapter.add_manual",
    targetType: "chapter",
    targetId: `${slug}#${chapterNumber}`,
  });

  return Response.json({ chapter }, { status: 201 });
}
