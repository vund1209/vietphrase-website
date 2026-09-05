// "Surf" mode: fetch + translate an arbitrary Chinese page without
// persisting anything (no Novel/Chapter rows) -- different from
// add-by-URL (src/app/api/novels/route.ts), which permanently embeds a
// novel. See docs/PLANNED_FEATURES.md. Unauthenticated, same as the
// standalone /translate page -- protected against SSRF via
// isSafePublicUrl since it makes a server-side fetch to whatever URL is
// submitted.
import { fetchChapterContent } from "@/lib/scraper";
import { translateText } from "@/lib/tokenizer";
import { isSafePublicUrl } from "@/lib/urlSafety";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const skipTranslate = body?.skipTranslate === true;

  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }
  if (!isSafePublicUrl(url)) {
    return Response.json({ error: "url is not a valid public http(s) address" }, { status: 400 });
  }

  let fetched;
  try {
    fetched = await fetchChapterContent(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch page";
    return Response.json({ error: message }, { status: 422 });
  }

  if (skipTranslate) {
    return Response.json({
      title: fetched.title,
      content: fetched.rawText,
      translated: false,
    });
  }

  return Response.json({
    title: fetched.title ? translateText(fetched.title) : null,
    content: translateText(fetched.rawText),
    translated: true,
  });
}
