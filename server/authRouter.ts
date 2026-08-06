import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, protectedProcedure } from "./middleware";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
  buildSessionCookie,
  buildClearCookie,
} from "./lib/auth";
import {
  findUserByEmail,
  createUser,
  recordFailedLogin,
  resetFailedLogin,
  createSession,
  revokeSession,
} from "./queries/userQueries";

const SESSION_DURATION_REMEMBER = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_DURATION_NORMAL = 24 * 60 * 60 * 1000; // 24 hours

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  name: z.string().trim().min(1, "Name is required").max(100),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

export const authRouter = createRouter({
  /**
   * Register a new user account.
   */
  register: publicQuery
    .input(registerSchema)
    .mutation(async ({ input, ctx }) => {
      const existingUser = await findUserByEmail(input.email);
      if (existingUser) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An account with this email address already exists.",
        });
      }

      const passwordHash = await hashPassword(input.password);
      const user = await createUser({
        email: input.email,
        passwordHash,
        name: input.name,
      });

      const token = generateSessionToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + SESSION_DURATION_REMEMBER);

      await createSession({
        userId: user.id,
        tokenHash,
        ipAddress: ctx.req.headers.get("x-forwarded-for") ?? undefined,
        userAgent: ctx.req.headers.get("user-agent") ?? undefined,
        expiresAt,
      });

      const cookieHeader = buildSessionCookie(
        token,
        SESSION_DURATION_REMEMBER / 1000,
      );
      ctx.resHeaders.append("Set-Cookie", cookieHeader);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    }),

  /**
   * Log in to an existing account.
   */
  login: publicQuery.input(loginSchema).mutation(async ({ input, ctx }) => {
    const user = await findUserByEmail(input.email);

    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Account is disabled. Please contact support.",
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / (60 * 1000),
      );
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Account is temporarily locked. Please try again in ${remainingMinutes} minute(s).`,
      });
    }

    const isValidPassword = await verifyPassword(input.password, user.passwordHash);

    if (!isValidPassword) {
      await recordFailedLogin(user);
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password.",
      });
    }

    await resetFailedLogin(user.id);

    const duration = input.rememberMe
      ? SESSION_DURATION_REMEMBER
      : SESSION_DURATION_NORMAL;
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + duration);

    await createSession({
      userId: user.id,
      tokenHash,
      ipAddress: ctx.req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: ctx.req.headers.get("user-agent") ?? undefined,
      expiresAt,
    });

    const cookieHeader = buildSessionCookie(token, duration / 1000);
    ctx.resHeaders.append("Set-Cookie", cookieHeader);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }),

  /**
   * Log out current user and invalidate active session.
   */
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.rawToken) {
      const tokenHash = hashToken(ctx.rawToken);
      await revokeSession(tokenHash);
    }

    const cookieHeader = buildClearCookie();
    ctx.resHeaders.append("Set-Cookie", cookieHeader);

    return { ok: true };
  }),

  /**
   * Fetch current authenticated user session profile.
   */
  me: publicQuery.query(({ ctx }) => {
    if (!ctx.user) return null;
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
      lastLoginAt: ctx.user.lastLoginAt,
      createdAt: ctx.user.createdAt,
    };
  }),
});
