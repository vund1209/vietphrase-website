// Next.js calls register() once per server instance, before it serves
// any request -- the right place to make sure the bulk dictionary file
// is on disk (see src/lib/dictionaryDb.ts) before a request tries to
// tokenize anything. https://nextjs.org/docs/app/guides/instrumentation
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDictionaryDb } = await import("@/lib/dictionaryDb");
    await ensureDictionaryDb();
  }
}
