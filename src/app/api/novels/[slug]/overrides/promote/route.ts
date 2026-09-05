// Editor-only: promote a chineseText/vietnameseText pair into the
// novel's shared Name dictionary (see docs/ARCHITECTURE.md "User
// management and per-word overrides"). Takes the pair directly rather
// than a specific UserWordOverride id, so an editor can review any
// reader's suggestion (or type their own correction) and promote
// whichever value they judge best -- not necessarily their own.
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
  if (session.user.role !== "EDITOR") {
    return Response.json({ error: "Editor role required" }, { status: 403 });
  }

  const { slug } = await params;
  const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true } });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const chineseText = typeof body?.chineseText === "string" ? body.chineseText.trim() : "";
  const vietnameseText =
    typeof body?.vietnameseText === "string" ? body.vietnameseText.trim() : "";

  if (!chineseText || !vietnameseText) {
    return Response.json(
      { error: "chineseText and vietnameseText are both required" },
      { status: 400 }
    );
  }

  const editorId = Number(session.user.id);
  const name = await prisma.name.upsert({
    where: { chineseText_novelId: { chineseText, novelId: novel.id } },
    create: {
      chineseText,
      vietnameseText,
      novelId: novel.id,
      phraseLength: chineseText.length,
      source: "user_promoted",
      promotedByUserId: editorId,
    },
    update: {
      vietnameseText,
      isActive: true,
      promotedByUserId: editorId,
    },
  });

  // The shared dictionary just changed -- every reader's cached
  // translatedText for this novel was computed against the old
  // dictionary, so it's stale. Clear it (rawText is untouched and still
  // valid) so the next view of each chapter re-translates lazily
  // instead of serving the outdated cache -- see docs/ARCHITECTURE.md
  // "Scrape timing".
  await prisma.chapter.updateMany({
    where: { novelId: novel.id, status: "TRANSLATED" },
    data: { translatedText: null, status: "SCRAPED" },
  });

  return Response.json({ name });
}
