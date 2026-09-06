// Lightweight, Postgres-backed rate limiter -- no external service
// (Upstash/Redis) for what's a modest request volume, reusing the
// existing Neon DB instead. See prisma/schema.prisma's RateLimitBucket
// and the planning doc's section 5 ("Surf/Browse rate limiting").
import { createHash } from "node:crypto";
import { prisma } from "./prisma.ts";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Only set when `allowed` is false. */
  retryAfterSeconds?: number;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/** Best-effort client IP from a Route Handler's Request -- Vercel sets x-forwarded-for. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Fixed-window limiter. `bucket` scopes independent limits -- e.g.
 * "surf" is shared by both /api/surf and /surf/browse so switching
 * between them doesn't bypass the limit (see the planning doc's section
 * 5). `ip` should come from getClientIp (Route Handlers) or reading the
 * same header via next/headers (Server Components) -- never the raw
 * value is stored, only its hash.
 */
export async function checkRateLimit(
  bucket: string,
  ip: string,
  { windowMs, max }: RateLimitOptions
): Promise<RateLimitResult> {
  const ipHash = hashIp(ip);
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const row = await prisma.rateLimitBucket.upsert({
    where: { bucket_ipHash_windowStart: { bucket, ipHash, windowStart } },
    create: { bucket, ipHash, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  // Opportunistic cleanup of old windows -- cheap (indexed on
  // windowStart) and avoids needing a cron job for what's a small table;
  // only runs on a small fraction of requests since it's not on the hot
  // path for correctness.
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - windowMs * 4);
    prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: cutoff } } }).catch(() => {});
  }

  if (row.count > max) {
    const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }
  return { allowed: true };
}
