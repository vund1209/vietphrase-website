// Audit trail for admin/embed actions -- see prisma/schema.prisma's
// AdminActivityLog and the planning doc's section 5. Fire-and-forget:
// logging must never break the action it's recording, so a write failure
// here is swallowed (and reported to stderr for operator visibility)
// rather than surfaced to the caller.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface LogActivityInput {
  /** Null for an anonymous actor -- e.g. a rate-limit denial. */
  userId: number | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await prisma.adminActivityLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}
