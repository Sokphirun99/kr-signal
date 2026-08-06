import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
  parseCookie,
  buildSessionCookie,
  buildClearCookie,
} from "./lib/auth";

describe("Authentication Security Utilities", () => {
  it("should hash and verify passwords correctly", async () => {
    const plainPassword = "SuperSecretPassword123!";
    const hash = await hashPassword(plainPassword);

    expect(hash).toContain(":");
    expect(await verifyPassword(plainPassword, hash)).toBe(true);
    expect(await verifyPassword("WrongPassword123!", hash)).toBe(false);
  });

  it("should generate random tokens and deterministic token hashes", () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).not.toEqual(token2);
    expect(token1.length).toBe(64); // 32 bytes hex = 64 chars

    const hash1 = hashToken(token1);
    const hash2 = hashToken(token1);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toEqual(hashToken(token2));
  });

  it("should parse cookie header correctly", () => {
    const cookieHeader = "theme=dark; sid=abc123xyz; visitor=1";
    expect(parseCookie(cookieHeader, "sid")).toBe("abc123xyz");
    expect(parseCookie(cookieHeader, "missing")).toBeNull();
    expect(parseCookie(null, "sid")).toBeNull();
  });

  it("should build session cookie and clear cookie strings correctly", () => {
    const sessionCookie = buildSessionCookie("testtoken123", 3600);
    expect(sessionCookie).toContain("sid=testtoken123");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Max-Age=3600");

    const clearCookie = buildClearCookie();
    expect(clearCookie).toContain("sid=");
    expect(clearCookie).toContain("Max-Age=0");
  });
});
