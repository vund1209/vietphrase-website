// Deactivate (or reactivate) one global dictionary entry -- see
// ../route.ts for creating/updating entries. ADMIN-only, same as the
// collection route. `track` is required in the body: GlobalWordOverride
// and GlobalNameOverride each autoincrement their own `id` column, so the
// same numeric id can refer to a different row in each table -- `track`
// disambiguates which one this request means.
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateTrack, type OverrideTrack } from "@/lib/overrides";
import { bumpDictionaryVersion } from "@/lib/dictionaryVersion";
import { logActivity } from "@/lib/adminActivity";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return Response.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : true;
  const track: OverrideTrack = validateTrack(body?.track) ? body.track : "phrase";

  const adminId = Number(session.user.id);

  if (track === "name") {
    const existing = await prisma.globalNameOverride.findUnique({ where: { id: entryId } });
    if (!existing) {
      return Response.json({ error: "Entry not found" }, { status: 404 });
    }
    const entry = await prisma.globalNameOverride.update({ where: { id: entryId }, data: { isActive } });
    await bumpDictionaryVersion();
    await logActivity({
      userId: adminId,
      action: "global_dictionary.set_active",
      targetType: "global_name_override",
      targetId: String(entryId),
      metadata: { isActive },
    });
    return Response.json({ entry: { ...entry, track } });
  }

  const existing = await prisma.globalWordOverride.findUnique({ where: { id: entryId } });
  if (!existing) {
    return Response.json({ error: "Entry not found" }, { status: 404 });
  }
  const entry = await prisma.globalWordOverride.update({ where: { id: entryId }, data: { isActive } });
  await bumpDictionaryVersion();
  await logActivity({
    userId: adminId,
    action: "global_dictionary.set_active",
    targetType: "global_word_override",
    targetId: String(entryId),
    metadata: { isActive },
  });
  return Response.json({ entry: { ...entry, track } });
}
