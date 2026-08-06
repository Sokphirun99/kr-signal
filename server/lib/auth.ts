import { scrypt, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const TOKEN_BYTES = 32;

/**
 * Hash a plain text password using Node.js scrypt.
 * Returns formatted string: salt:hash (hex encoded).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a plain text password against a stored salt:hash string.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;

  const [salt, key] = parts;
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;

  if (keyBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(keyBuffer, derivedKey);
}

/**
 * Generate a cryptographically strong random session token string.
 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * Hash a raw session token using SHA-256 for safe database indexing and storage.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Parse a named cookie value from a raw Cookie header string.
 */
export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|; )\\s*${name}\\s*=\\s*([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Construct Set-Cookie header value string for user session token.
 */
export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const secure = isProd ? "Secure; " : "";
  return `sid=${encodeURIComponent(token)}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/**
 * Construct Set-Cookie header string to clear current session cookie.
 */
export function buildClearCookie(): string {
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const secure = isProd ? "Secure; " : "";
  return `sid=; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

