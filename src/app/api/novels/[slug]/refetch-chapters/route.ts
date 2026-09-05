// Admin-only: checks the novel's source site for chapters published since
// it was added and appends only the new ones. See src/lib/scraper.ts's
// selectNewChapters doc comment for why this exists at all -- a book's
// chapter list is otherwise fetched exactly once, at add time, and never
// revisited.
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchChapterList, extractSourceChapterId, selectNewChapters } from "@/lib/scraper";
import { translateText } from "@/lib/tokenizer";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return Response.json({ error: "Admin role required" }, { status: 403 });
  }

  const { slug } = await params;
  const novel = await prisma.novel.findUnique({
    where: { slug },
    select: {
      id: true,
      sourceUrl: true,
      chapters: { select: { sourceUrl: true, chapterNumber: true } },
    },
  });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }
  if (!novel.sourceUrl) {
    return Response.json({ error: "Novel has no source URL to re-fetch from" }, { status: 400 });
  }

  let fetched;
  try {
    fetched = await fetchChapterList(novel.sourceUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch chapter list";
    return Response.json({ error: message }, { status: 422 });
  }

  const existingSourceUrls = new Set(novel.chapters.map((c) => c.sourceUrl));
  const newChapters = selectNewChapters(existingSourceUrls, fetched.chapters);
  if (newChapters.length === 0) {
    return Response.json({ added: 0 });
  }

  const nextNumber = novel.chapters.reduce((max, c) => Math.max(max, c.chapterNumber), 0) + 1;
  await prisma.chapter.createMany({
    data: newChapters.map((c, i) => ({
      novelId: novel.id,
      chapterNumber: nextNumber + i,
      title: translateText(c.title),
      originalTitle: c.title,
      sourceChapterId: extractSourceChapterId(c.url),
      sourceUrl: c.url,
      status: "PENDING",
    })),
  });

  return Response.json({ added: newChapters.length });
}
