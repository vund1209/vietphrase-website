// Powers the header's dictionary-status dot (DictionaryStatusDot.tsx).
// Unauthenticated -- this is just operational status (download progress
// of a public dictionary file), nothing sensitive. See
// src/lib/dictionaryDb.ts's getDictionaryStatus doc comment for why this
// is a best-effort signal, not a guaranteed-accurate one, on a
// multi-instance serverless deployment.
import { getDictionaryStatus } from "@/lib/dictionaryDb";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(getDictionaryStatus());
}
