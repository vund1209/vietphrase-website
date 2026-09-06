import type { Chapter } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrTranslateChapter, ChapterNotFoundError, ScrapeFailedError } from "@/lib/novels";
import { isOwnerOrAdmin } from "@/lib/isOwnerOrAdmin";
import { stripDangerousMarkup } from "@/lib/sanitizeText";
import { detectSourceLanguage } from "@/lib/chapterChunking";
import { logActivity } from "@/lib/adminActivity";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; number: string }> }
): Promise<Response> {
  const { slug, number } = await params;
  const chapterNumber = Number(number);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return Response.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  try {
    const result = await getOrTranslateChapter(slug, chapterNumber);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ChapterNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ScrapeFailedError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}

// Owner/admin-only edit and delete for one chapter of a USER_CREATED
// novel -- see the planning doc's section 8. Distinct from
// .../refetch/route.ts (SCRAPED-only, clears rawText for a re-scrape).
type LoadResult =
  | { ok: false; error: Response }
  | { ok: true; novel: { id: number; origin: string; addedByUserId: number | null }; chapter: Chapter };

async function loadOwnedUserCreatedChapter(
  slug: string,
  chapterNumber: number,
  sessionUser: { id?: string; role?: unknown } | undefined
): Promise<LoadResult> {
  const novel = await prisma.novel.findUnique({
    where: { slug },
    select: { id: true, origin: true, addedByUserId: true },
  });
  if (!novel) return { ok: false, error: Response.json({ error: "Novel not found" }, { status: 404 }) };
  if (novel.origin !== "USER_CREATED") {
    return {
      ok: false,
      error: Response.json({ error: "Only user-created novels can be edited this way" }, { status: 400 }),
    };
  }
  if (!isOwnerOrAdmin(novel, { user: sessionUser })) {
    return { ok: false, error: Response.json({ error: "Not the owner of this novel" }, { status: 403 }) };
  }
  const chapter = await prisma.chapter.findUnique({
    where: { novelId_chapterNumber: { novelId: novel.id, chapterNumber } },
  });
  if (!chapter) return { ok: false, error: Response.json({ error: "Chapter not found" }, { status: 404 }) };
  return { ok: true, novel, chapter };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; number: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug, number } = await params;
  const chapterNumber = Number(number);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return Response.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  const loaded = await loadOwnedUserCreatedChapter(slug, chapterNumber, session.user);
  if (!loaded.ok) return loaded.error;

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const rawTextRaw = typeof body?.rawText === "string" ? body.rawText.trim() : "";
  if (!title || !rawTextRaw) {
    return Response.json({ error: "title and rawText are both required" }, { status: 400 });
  }
  const rawText = stripDangerousMarkup(rawTextRaw);

  const updated = await prisma.chapter.update({
    where: { id: loaded.chapter.id },
    data: {
      title,
      originalTitle: title,
      rawText,
      sourceLanguage: detectSourceLanguage(rawText),
      status: "SCRAPED",
    },
  });

  await logActivity({
    userId: Number(session.user.id),
    action: "chapter.edit",
    targetType: "chapter",
    targetId: `${slug}#${chapterNumber}`,
  });

  return Response.json({ chapter: updated });
}

// Deletes the chapter and shifts every subsequent chapter's number down
// by one, keeping the dense 1..N sequence every other feature (TOC panel,
// prev/next math, totalChapters) already assumes -- see the planning
// doc's section 8 for the explicit tradeoff (a later chapter's URL shifts).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; number: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug, number } = await params;
  const chapterNumber = Number(number);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return Response.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  const loaded = await loadOwnedUserCreatedChapter(slug, chapterNumber, session.user);
  if (!loaded.ok) return loaded.error;
  const { novel, chapter } = loaded;

  await prisma.$transaction(async (tx) => {
    await tx.chapter.delete({ where: { id: chapter.id } });
    const laterChapters = await tx.chapter.findMany({
      where: { novelId: novel.id, chapterNumber: { gt: chapterNumber } },
      orderBy: { chapterNumber: "asc" },
      select: { id: true, chapterNumber: true },
    });
    // One at a time, ascending: shifting down by one can never collide
    // with an already-shifted neighbor above it in this same pass.
    for (const c of laterChapters) {
      await tx.chapter.update({ where: { id: c.id }, data: { chapterNumber: c.chapterNumber - 1 } });
    }
  });

  await logActivity({
    userId: Number(session.user.id),
    action: "chapter.delete",
    targetType: "chapter",
    targetId: `${slug}#${chapterNumber}`,
  });

  return Response.json({ ok: true });
}
