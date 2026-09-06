import type { Token } from "@vietphrase/tokenizer";
import { getTokenizer } from "@/lib/tokenizer";
import { ensureDictionaryDb } from "@/lib/dictionaryDb";

export interface TranslateResponse {
  tokens: Token[];
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : "";

  if (!content.trim()) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  // Belt-and-suspenders alongside instrumentation.ts's register() hook --
  // see src/lib/novels.ts's getOrTranslateChapter for why this exists.
  await ensureDictionaryDb();

  // No novel context here -- global resolution only, per
  // docs/VIETPHRASE_CORE.md "Per-novel name resolution".
  const tokens = getTokenizer().tokenize(content);
  return Response.json({ tokens } satisfies TranslateResponse);
}
