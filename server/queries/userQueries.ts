import { eq, and, gt, isNull } from "drizzle-orm";
import { getDb } from "./connection";
import { users, sessions, type User, type InsertUser, type Session } from "@db/schema";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Retrieve a user record by email address.
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return user ?? null;
}

/**
 * Retrieve a user record by primary key UUID.
 */
export async function findUserById(id: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}

/**
 * Create a new user in the database.
 */
export async function createUser(data: InsertUser): Promise<User> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      ...data,
      email: data.email.toLowerCase().trim(),
    })
    .returning();
  return user;
}

/**
 * Record a failed login attempt and apply lockout if max attempts exceeded.
 */
export async function recordFailedLogin(user: User): Promise<void> {
  const db = getDb();
  const attempts = user.failedAttempts + 1;
  let lockedUntil: Date | null = user.lockedUntil;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  }

  await db
    .update(users)
    .set({
      failedAttempts: attempts,
      lockedUntil,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
}

/**
 * Reset failed login counters upon successful authentication.
 */
export async function resetFailedLogin(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Create a session record for an authenticated user.
 */
export async function createSession(params: {
  userId: string;
  tokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}): Promise<Session> {
  const db = getDb();
  const [session] = await db
    .insert(sessions)
    .values({
      userId: params.userId,
      tokenHash: params.tokenHash,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      expiresAt: params.expiresAt,
    })
    .returning();
  return session;
}

/**
 * Find active, non-expired session along with associated user profile.
 */
export async function findSessionWithUser(tokenHash: string): Promise<{
  session: Session;
  user: User;
} | null> {
  const db = getDb();
  const now = new Date();

  const results = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  return results[0] ?? null;
}

/**
 * Revoke a session token.
 */
export async function revokeSession(tokenHash: string): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, tokenHash));
}
