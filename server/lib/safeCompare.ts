import { timingSafeEqual } from "node:crypto";

/**
 * Compares two strings in constant time to mitigate timing attacks on auth tokens.
 * Inputs: a - string to compare, b - string to compare against.
 * Outputs: boolean indicating exact equality.
 * Side effects: none.
 * Failure modes: returns false on mismatched string lengths.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
