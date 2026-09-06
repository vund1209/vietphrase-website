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
//
// Streams newline-delimited JSON progress events instead of a single
// JSON response -- a real download here takes 25-60s (this feature's
// own tested timing), long enough that a static "importing..." label
// isn't good enough. Auth/URL validation still fail fast with a normal
// JSON error response *before* any streaming starts (so the client's
// initial `res.ok` check still works for those); once the stream opens,
// the final outcome (including failures partway through) is reported as
// the last line rather than via the HTTP status, since headers are
// already committed by then.
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

  const userId = Number(session!.user!.id);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      try {
        const { buffer } = await provider.fetchFile(url, (progress) => send({ type: "progress", ...progress }));

        const result = await persistImportedChapters(authResult.novel.id, buffer);
        if (!result.ok) {
          send({ type: "error", error: result.error });
          return;
        }

        await logActivity({
          userId,
          action: "chapter.import_url",
          targetType: "novel",
          targetId: slug,
          metadata: { added: result.added, encoding: result.encoding, provider: provider.name },
        });
        send({ type: "done", added: result.added, encoding: result.encoding });
      } catch (err) {
        // Never leak the provider library's internal error text verbatim
        // -- it may reference internal implementation details not
        // meaningful to a reader (e.g. raw megajs protocol errors).
        send({ type: "error", error: err instanceof Error ? err.message : "Không thể tải file" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
