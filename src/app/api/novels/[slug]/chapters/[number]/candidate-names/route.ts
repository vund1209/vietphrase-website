// Powers CandidateNamesPanel.tsx's collapsible "Tên riêng & thuật ngữ"
// panel -- see src/lib/candidateNames.ts for the detection heuristic.
// Open to every reader, signed-in or anonymous: candidate detection now
// runs over the shared-dictionary-only token stream every reader gets
// (see src/lib/novels.ts's tokenizeChapter -- personal overrides moved
// entirely client-side, see the planning doc's section 3). Read-only, no
// state written -- the panel's "+ Từ điển" action reuses ChapterReader's
// own personal-save path (IndexedDB, plus a POST when signed in).
import { prisma } from "@/lib/prisma";
import { tokenizeChapter } from "@/lib/novels";
import { detectCandidateNames } from "@/lib/candidateNames";
import { ensureDictionaryDb } from "@/lib/dictionaryDb";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; number: string }> }
): Promise<Response> {
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
    select: { rawText: true },
  });
  if (!chapter?.rawText) {
    // Not scraped yet -- nothing to scan. Not an error: the reader just
    // hasn't opened this chapter far enough for content to exist.
    return Response.json({ candidates: [] });
  }

  await ensureDictionaryDb();
  const lines = await tokenizeChapter(novel.id, chapter.rawText);
  return Response.json({ candidates: detectCandidateNames(lines) });
}
