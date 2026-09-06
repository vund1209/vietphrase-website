// Owner-only .txt import for a USER_CREATED novel -- see the planning
// doc's section 8. Usable both to seed a brand-new novel and to
// bulk-append more chapters to an existing one later; always appends
// starting at max(chapterNumber) + 1, mirroring
// .../refetch-chapters/route.ts's "append only what's new" shape (but
// there's no stable per-chapter URL to dedupe against here, so every
// import just appends whatever chunks result).
//
// Never persisted to disk: the uploaded file's bytes are decoded and
// chunked in memory, and only the resulting Chapter rows are written
// anywhere.
//
// Open engineering question this doesn't resolve (see the planning doc):
// a genuinely large novel could exceed Vercel's request body size limit
// for a single POST -- this implementation is a single-POST design;
// client-side pre-chunking or a streamed upload would need real
// investigation before this scales to very large files.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwnerOrAdmin } from "@/lib/isOwnerOrAdmin";
import { stripDangerousMarkup } from "@/lib/sanitizeText";
import { decodeTextFile } from "@/lib/textEncoding";
import { detectSourceLanguage, chunkNovelText } from "@/lib/chapterChunking";
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
    return Response.json({ error: "Only user-created novels can import chapters this way" }, { status: 400 });
  }
  if (!isOwnerOrAdmin(novel, session)) {
    return Response.json({ error: "Not the owner of this novel" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required (multipart/form-data)" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const { text, encoding } = decodeTextFile(buffer);
  const parsedChapters = chunkNovelText(text);
  if (parsedChapters.length === 0) {
    return Response.json({ error: "Could not find any chapter content in this file" }, { status: 422 });
  }

  const last = await prisma.chapter.findFirst({
    where: { novelId: novel.id },
    orderBy: { chapterNumber: "desc" },
    select: { chapterNumber: true },
  });
  const nextNumber = (last?.chapterNumber ?? 0) + 1;

  await prisma.chapter.createMany({
    data: parsedChapters.map((c, i) => {
      const rawText = stripDangerousMarkup(c.rawText);
      const title = stripDangerousMarkup(c.title);
      return {
        novelId: novel.id,
        chapterNumber: nextNumber + i,
        title,
        originalTitle: title,
        rawText,
        sourceLanguage: detectSourceLanguage(rawText),
        status: "SCRAPED" as const,
        scrapedAt: new Date(),
      };
    }),
  });

  await logActivity({
    userId: Number(session.user.id),
    action: "chapter.import_txt",
    targetType: "novel",
    targetId: slug,
    metadata: { added: parsedChapters.length, encoding },
  });

  return Response.json({ added: parsedChapters.length, encoding });
}
