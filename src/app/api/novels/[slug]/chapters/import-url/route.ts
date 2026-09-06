// Owner-only "import chapters from a URL" for a USER_CREATED novel --
// the same authorization and decode/chunk/persist pipeline as
// .../chapters/import/route.ts's file-upload flow (see
// src/lib/chapterImport.ts), just fed by a downloaded file instead of an
// uploaded one. Kept as its own route rather than branching the upload
// route on content-type: the two request shapes only share
// post-parsing logic, and a distinct route gets its own audit-log
// action and can be rate-limited differently later (outbound-fetch
// abuse has a different profile than upload abuse) without touching
// the existing route at all.
import { auth } from "@/lib/auth";
import { authorizeChapterImport, persistImportedChapters } from "@/lib/chapterImport";
import { resolveImportSourceProvider } from "@/lib/importSources/providers";
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

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  const provider = resolveImportSourceProvider(url);
  if (!provider) {
    return Response.json({ error: "URL không được hỗ trợ -- hiện chỉ hỗ trợ mega.nz" }, { status: 400 });
  }

  let buffer: ArrayBuffer;
  try {
    ({ buffer } = await provider.fetchFile(url));
  } catch (err) {
    // Never leak the provider library's internal error text verbatim --
    // it may reference internal implementation details not meaningful
    // to a reader (e.g. raw megajs protocol errors).
    const message = err instanceof Error ? err.message : "Không thể tải file";
    return Response.json({ error: message }, { status: 502 });
  }

  const result = await persistImportedChapters(authResult.novel.id, buffer);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  await logActivity({
    userId: Number(session!.user!.id),
    action: "chapter.import_url",
    targetType: "novel",
    targetId: slug,
    metadata: { added: result.added, encoding: result.encoding, provider: provider.name },
  });

  return Response.json({ added: result.added, encoding: result.encoding });
}
