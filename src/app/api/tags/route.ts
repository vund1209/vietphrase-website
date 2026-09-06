import { listAllTags } from "@/lib/tags";

// Public, read-only: the full preset tag list, loaded once by TagCombobox
// and filtered client-side (see the planning doc's section 13) rather
// than a per-keystroke server round trip. Small/bounded (tens of rows).
export async function GET(): Promise<Response> {
  const tags = await listAllTags();
  return Response.json({ tags });
}
