// Editor-only: promote a chineseText/vietnameseText pair into the
// novel's shared Name dictionary (see docs/ARCHITECTURE.md "User
// management and per-word overrides"). Takes the pair directly rather
// than a specific UserWordOverride id, so an editor can review any
// reader's suggestion (or type their own correction) and promote
// whichever value they judge best -- not necessarily their own.
import { auth, isEditorOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { translateText } from "@/lib/tokenizer";
import { loadOverridesForNovel, validateOverridePair, validateCapStyle } from "@/lib/overrides";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isEditorOrAdmin(session.user.role)) {
    return Response.json({ error: "Editor role required" }, { status: 403 });
  }

  const { slug } = await params;
  const novel = await prisma.novel.findUnique({
    where: { slug },
    select: { id: true, originalTitle: true, originalDescription: true },
  });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const chineseText = typeof body?.chineseText === "string" ? body.chineseText.trim() : "";
  const vietnameseText =
    typeof body?.vietnameseText === "string" ? body.vietnameseText.trim() : "";

  const validationError = validateOverridePair(chineseText, vietnameseText);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }
  const capStyle = body?.capStyle ?? "NONE";
  if (!validateCapStyle(capStyle)) {
    return Response.json({ error: "Invalid capStyle" }, { status: 400 });
  }

  const editorId = Number(session.user.id);
  const name = await prisma.name.upsert({
    where: { chineseText_novelId: { chineseText, novelId: novel.id } },
    create: {
      chineseText,
      vietnameseText,
      capStyle,
      novelId: novel.id,
      phraseLength: chineseText.length,
      source: "user_promoted",
      promotedByUserId: editorId,
    },
    update: {
      vietnameseText,
      capStyle,
      isActive: true,
      promotedByUserId: editorId,
    },
  });

  // Titles are short strings -- cheap to redo synchronously here too, so
  // they stay in sync with the dictionary rather than going stale until
  // some other trigger re-translates them (there isn't one otherwise).
  // Chapter *body* text needs no such step: it's rendered live from
  // rawText on every view (see src/lib/novels.ts), so it already reflects
  // this change on the very next request.
  const freshOverrides = await loadOverridesForNovel(novel.id);
  if (novel.originalTitle || novel.originalDescription) {
    await prisma.novel.update({
      where: { id: novel.id },
      data: {
        ...(novel.originalTitle && {
          title: translateText(novel.originalTitle, freshOverrides.translations, freshOverrides.capStyles),
        }),
        ...(novel.originalDescription && {
          description: translateText(
            novel.originalDescription,
            freshOverrides.translations,
            freshOverrides.capStyles
          ),
        }),
      },
    });
  }
  const chaptersWithOriginalTitle = await prisma.chapter.findMany({
    where: { novelId: novel.id, originalTitle: { not: null } },
    select: { id: true, originalTitle: true },
  });
  await Promise.all(
    chaptersWithOriginalTitle.map((c) =>
      prisma.chapter.update({
        where: { id: c.id },
        data: {
          title: translateText(
            c.originalTitle as string,
            freshOverrides.translations,
            freshOverrides.capStyles
          ),
        },
      })
    )
  );

  return Response.json({ name });
}
