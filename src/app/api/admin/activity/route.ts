// Admin-only: permanently clears the audit trail (src/lib/adminActivity.ts,
// browsed at /admin/activity). ADMIN-only, not EDITOR+ADMIN, given the
// blast radius (every prior admin/embed action's record, irrecoverable).
// A single "activity.clear" row is written immediately after, attributing
// the clear itself -- so the log never goes from "has history" to
// "no record this ever happened", just to "starts fresh from here".
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/adminActivity";

export async function DELETE(): Promise<Response> {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return Response.json({ error: "Admin role required" }, { status: 403 });
  }

  const userId = Number(session.user.id);
  const { count } = await prisma.adminActivityLog.deleteMany({});
  await logActivity({ userId, action: "activity.clear", metadata: { clearedCount: count } });

  return Response.json({ ok: true, clearedCount: count });
}
