import { prisma } from "@/lib/prisma";

// Cheap liveness/readiness check for external uptime monitoring (e.g.
// UptimeRobot/Better Stack's free tier) -- there was previously no way
// for anything outside a user report to notice the app or its DB
// connection is down. A trivial round-trip, safe to poll frequently.
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch (err) {
    return Response.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 503 }
    );
  }
}
