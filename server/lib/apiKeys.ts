import "dotenv/config";
import { safeCompare } from "./safeCompare";

/**
 * Result of API key validation.
 */
export type ApiKeyValidationResult =
  | { status: "disabled" }
  | { status: "unauthorized" }
  | { status: "valid"; key: string };

/**
 * Extracts and trims configured API keys from the PUBLIC_API_KEYS environment variable.
 * Inputs: none.
 * Outputs: array of non-empty API key strings.
 * Side effects: reads process.env.PUBLIC_API_KEYS.
 * Failure modes: returns empty array if variable is unset, empty, or whitespace-only.
 */
export function getConfiguredApiKeys(): string[] {
  const raw =
    process.env.PUBLIC_API_KEYS ||
    process.env.API_KEYS ||
    process.env.REST_API_KEYS;
  if (!raw || !raw.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Validates an incoming API key against configured keys using constant-time comparison.
 * Inputs: headerKey - API key extracted from request header.
 * Outputs: ApiKeyValidationResult indicating disabled (if no keys set), unauthorized, or valid.
 * Side effects: none.
 * Failure modes: returns disabled when PUBLIC_API_KEYS is missing, unauthorized when invalid.
 */
export function validateApiKey(headerKey?: string | null): ApiKeyValidationResult {
  const keys = getConfiguredApiKeys();
  if (keys.length === 0) {
    return { status: "disabled" };
  }
  if (!headerKey || !headerKey.trim()) {
    return { status: "unauthorized" };
  }

  const trimmed = headerKey.trim();
  let matchedKey: string | null = null;
  for (const key of keys) {
    if (safeCompare(trimmed, key)) {
      matchedKey = key;
    }
  }

  if (!matchedKey) {
    return { status: "unauthorized" };
  }

  return { status: "valid", key: matchedKey };
}
