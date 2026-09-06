// "Surf" mode: fetch + translate an arbitrary Chinese page without
// persisting anything (no Novel/Chapter rows) -- different from
// add-by-URL (src/app/api/novels/route.ts), which permanently embeds a
// novel. See docs/PLANNED_FEATURES.md. Unauthenticated, same as the
// standalone /translate page -- protected against SSRF via
// isSafePublicUrl since it makes a server-side fetch to whatever URL is
// submitted. Rate-limited (shared "surf" bucket with /surf/browse) and,
// for an anonymous request, forbidden from escalating to a real headless
// browser launch on a bot-challenged page -- see the planning doc's
// section 5.
import { auth } from "@/lib/auth";
import { fetchChapterContent, HeadlessBrowserRequiredError } from "@/lib/scraper";
import { translateText } from "@/lib/tokenizer";
import { isSafePublicUrl } from "@/lib/urlSafety";
import { ensureDictionaryDb } from "@/lib/dictionaryDb";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logActivity } from "@/lib/adminActivity";

const SURF_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 20 };

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const rateLimit = await checkRateLimit("surf", getClientIp(request), SURF_RATE_LIMIT);
  if (!rateLimit.allowed) {
    await logActivity({
      userId,
      action: "rate_limit.denied",
      targetType: "route",
      targetId: "/api/surf",
    });
    return Response.json(
      { error: "Bạn thao tác quá nhanh -- vui lòng thử lại sau ít phút." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

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
    fetched = await fetchChapterContent(url, { allowHeadless: userId !== null });
  } catch (err) {
    if (err instanceof HeadlessBrowserRequiredError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
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

  // Belt-and-suspenders alongside instrumentation.ts's register() hook --
  // see src/lib/novels.ts's getOrTranslateChapter for why this exists.
  await ensureDictionaryDb();

  return Response.json({
    title: fetched.title ? translateText(fetched.title) : null,
    content: translateText(fetched.rawText),
    translated: true,
  });
}
