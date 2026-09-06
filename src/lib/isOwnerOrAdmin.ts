// This codebase's first *resource-ownership* authorization check --
// everything else in src/lib/auth.ts (isAdmin, isEditorOrAdmin) is purely
// role-based (READER/EDITOR/ADMIN), with no notion of "this specific
// user owns this specific row." Deliberately kept as its own small
// module rather than folded into auth.ts, so the distinction stays
// visible rather than being force-fit into the role-helper pattern. See
// the planning doc's section 8: a USER_CREATED novel's
// `addedByUserId` doubles as ownership, not just attribution.
//
// Deliberately does NOT import src/lib/auth.ts's isAdmin -- that module
// transitively pulls in next-auth, which in turn imports "next/server"
// in a way plain `node --test` can't resolve outside Next.js's own
// bundler (confirmed directly: importing it broke this module's own
// unit tests). The ADMIN check is simple and stable enough to inline
// directly rather than carry that whole dependency chain just for it.
export function isOwnerOrAdmin(
  novel: { addedByUserId: number | null },
  session: { user?: { id?: string; role?: unknown } } | null
): boolean {
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;
  return novel.addedByUserId !== null && Number(session.user.id) === novel.addedByUserId;
}
