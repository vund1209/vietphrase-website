// Deactivate (or reactivate) one global dictionary entry -- see
// ../route.ts for creating/updating entries. ADMIN-only, same as the
// collection route.
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const existing = await prisma.globalWordOverride.findUnique({ where: { id: entryId } });
  if (!existing) {
    return Response.json({ error: "Entry not found" }, { status: 404 });
  }

  const entry = await prisma.globalWordOverride.update({
    where: { id: entryId },
    data: { isActive },
  });
  return Response.json({ entry });
}
