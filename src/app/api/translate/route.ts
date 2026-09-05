import path from "node:path";
import { VietPhraseTokenizer, type Token } from "@vietphrase/tokenizer";

// Interim data source: reads dictionary_seed.db directly, per
// docs/ARCHITECTURE.md "Translate page: API design". This is a plain
// per-lookup SQLite connection, fine for one dev process -- see
// docs/ARCHITECTURE.md's noted correction about moving to an in-memory
// dictionary cache before this is backed by Postgres at scale (that
// hasn't happened yet; this route talks to SQLite directly, same as the
// tokenizer's own test suite).
const DB_PATH = path.join(process.cwd(), "data", "seed", "dictionary_seed.db");

let tokenizer: VietPhraseTokenizer | undefined;
function getTokenizer(): VietPhraseTokenizer {
  if (!tokenizer) {
    tokenizer = new VietPhraseTokenizer(DB_PATH);
  }
  return tokenizer;
}

export interface TranslateResponse {
  tokens: Token[];
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : "";

  if (!content.trim()) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  const tokens = getTokenizer().tokenize(content);
  return Response.json({ tokens } satisfies TranslateResponse);
}
