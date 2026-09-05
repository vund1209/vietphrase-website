#!/usr/bin/env node
// One-off utility: grant/change a user's role. There is no self-service
// upgrade path in the app (see prisma/schema.prisma's User.role comment)
// -- this script is the intended way to promote an existing account to
// EDITOR or ADMIN.
//
// Usage: node scripts/set-user-role.mjs <email> <READER|EDITOR|ADMIN>
import { PrismaClient } from "@prisma/client";

const VALID_ROLES = ["READER", "EDITOR", "ADMIN"];

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !role) {
    console.error("Usage: node scripts/set-user-role.mjs <email> <READER|EDITOR|ADMIN>");
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({
      where: { email: email.trim().toLowerCase() },
      data: { role },
      select: { id: true, email: true, role: true },
    });
    console.log(`Updated: ${user.email} (id ${user.id}) -> ${user.role}`);
  } catch (err) {
    if (err?.code === "P2025") {
      console.error(`No user found with email "${email}"`);
      process.exit(1);
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main();
