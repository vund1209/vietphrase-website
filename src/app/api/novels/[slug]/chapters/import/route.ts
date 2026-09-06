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
import { authorizeChapterImport, persistImportedChapters } from "@/lib/chapterImport";
import { logActivity } from "@/lib/adminActivity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  const { slug } = await params;

  const authResult = await authorizeChapterImport(slug, session);
  if (!authResult.ok) {
    return Response.json({ error: authResult.error }, { status: authResult.status });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required (multipart/form-data)" }, { status: 400 });
  }

  const result = await persistImportedChapters(authResult.novel.id, await file.arrayBuffer());
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  await logActivity({
    userId: Number(session!.user!.id),
    action: "chapter.import_txt",
    targetType: "novel",
    targetId: slug,
    metadata: { added: result.added, encoding: result.encoding },
  });

  return Response.json({ added: result.added, encoding: result.encoding });
}
