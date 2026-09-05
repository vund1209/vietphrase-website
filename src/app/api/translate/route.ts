import type { Token } from "@vietphrase/tokenizer";
import { getTokenizer } from "@/lib/tokenizer";

export interface TranslateResponse {
  tokens: Token[];
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : "";

  if (!content.trim()) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  // No novel context here -- global resolution only, per
  // docs/VIETPHRASE_CORE.md "Per-novel name resolution".
  const tokens = getTokenizer().tokenize(content);
  return Response.json({ tokens } satisfies TranslateResponse);
}
