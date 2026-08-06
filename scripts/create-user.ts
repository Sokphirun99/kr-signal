import "dotenv/config";
import { parseArgs } from "node:util";
import { findUserByEmail, createUser } from "../server/queries/userQueries";
import { hashPassword } from "../server/lib/auth";
import { getDb } from "../server/queries/connection";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string", short: "e" },
      password: { type: "string", short: "p" },
      name: { type: "string", short: "n" },
      role: { type: "string", short: "r", default: "user" },
    },
    strict: false,
  });

  const email = (typeof values.email === "string" ? values.email : undefined) || process.env.USER_EMAIL;
  const password = (typeof values.password === "string" ? values.password : undefined) || process.env.USER_PASSWORD;
  const name = (typeof values.name === "string" ? values.name : undefined) || process.env.USER_NAME || "Default User";
  const role = (values.role === "admin" ? "admin" : "user") as "admin" | "user";

  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-user.ts --email=user@example.com --password=Secret123! [--name='John'] [--role=admin]");
    process.exit(1);
  }

  console.log(`Creating/updating user: ${email} (${role})...`);

  const existing = await findUserByEmail(email);
  const passwordHash = await hashPassword(password);

  if (existing) {
    const db = getDb();
    await db
      .update(users)
      .set({
        passwordHash,
        name,
        role,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));

    console.log(`✅ Successfully updated existing user ${email} (ID: ${existing.id}).`);
  } else {
    const newUser = await createUser({
      email,
      passwordHash,
      name,
      role,
    });
    console.log(`✅ Successfully created new user ${email} (ID: ${newUser.id}).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error creating user:", err);
  process.exit(1);
});
