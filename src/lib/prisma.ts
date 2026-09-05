// Standard Next.js dev-safe Prisma singleton: without this, hot-reload in
// `next dev` would create a fresh PrismaClient (and a fresh pool of
// connections against Neon) on every file save, eventually exhausting the
// free-tier connection limit. In production (one long-lived process) the
// globalThis caching is a no-op but harmless.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
