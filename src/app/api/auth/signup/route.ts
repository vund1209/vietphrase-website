// Registration endpoint. The Credentials provider (src/lib/auth.ts) only
// handles *logging in* an existing user -- Auth.js has no built-in
// sign-up flow for it, so this is a plain API route the login/signup
// page calls before invoking next-auth's signIn().
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !email.includes("@")) {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return Response.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  // Cost factor 12: a reasonable bcrypt work factor for a freshly-hashed
  // password as of 2026 (vs. the older default of 10).
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true, role: true },
  });

  return Response.json({ user }, { status: 201 });
}
