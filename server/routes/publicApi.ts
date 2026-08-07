import { Hono } from "hono";
import type { Context } from "hono";
import fs from "node:fs";
import path from "node:path";
import { validateApiKey } from "../lib/apiKeys";
import { publicApiRateLimiter } from "../lib/rateLimit";
import { listSignals, getSignalById, computeTrackRecord } from "../queries/signals";
import { INSTRUMENTS, type SignalStatus } from "@contracts/instruments";

export const publicApi = new Hono();

const VALID_STATUSES: SignalStatus[] = [
  "open",
  "tp1",
  "tp2",
  "tp3",
  "sl",
  "be",
  "expired",
  "undecidable",
];

const VALID_SYMBOLS = new Set(INSTRUMENTS.map((i) => i.symbol));

/**
 * Returns a standardized JSON success envelope with payload and metadata.
 * Inputs: c - Hono context, data - response payload, count - item count, cacheControl - optional header.
 * Outputs: JSON Response with data and meta fields.
 * Side effects: sets Cache-Control header if provided.
 * Failure modes: none.
 */
function jsonEnvelope<T>(
  c: Context,
  data: T,
  count?: number,
  cacheControl?: string,
) {
  if (cacheControl) {
    c.header("Cache-Control", cacheControl);
  }
  const metaCount = count ?? (Array.isArray(data) ? data.length : 1);
  return c.json({
    data,
    meta: {
      count: metaCount,
      generatedAt: new Date().toISOString(),
    },
  });
}

/**
 * Returns a standardized JSON error response.
 * Inputs: c - Hono context, status - HTTP status, code - machine error code, message - human message, extra - extra fields.
 * Outputs: JSON Response with error structure.
 * Side effects: none.
 * Failure modes: none.
 */
function jsonError(
  c: Context,
  status: 400 | 401 | 404 | 405 | 429 | 500 | 503,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return c.json(
    {
      error: { code, message },
      code,
      ...extra,
    },
    status,
  );
}

// 1. Method restriction: Reject non-GET methods with 405
publicApi.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    c.header("Allow", "GET, HEAD");
    return jsonError(
      c,
      405,
      "METHOD_NOT_ALLOWED",
      "Method not allowed. The public API only supports GET requests.",
    );
  }
  await next();
});

// 2. Unauthenticated static OpenAPI specification endpoint
publicApi.get("/openapi.yaml", (c) => {
  const filePath = path.resolve(process.cwd(), "openapi.yaml");
  if (!fs.existsSync(filePath)) {
    return jsonError(c, 404, "NOT_FOUND", "OpenAPI specification not found on server.");
  }
  const yamlContent = fs.readFileSync(filePath, "utf-8");
  return c.text(yamlContent, 200, {
    "Content-Type": "application/yaml; charset=utf-8",
  });
});

// 3. Authentication & Rate Limiting Middleware for all other endpoints
publicApi.use("*", async (c, next) => {
  if (c.req.path.endsWith("/openapi.yaml")) {
    return next();
  }

  const authHeaderKey = c.req.header("x-api-key");
  const authResult = validateApiKey(authHeaderKey);

  if (authResult.status === "disabled") {
    return jsonError(
      c,
      503,
      "API_DISABLED",
      "Public API is currently disabled. Contact support to request access.",
    );
  }

  if (authResult.status === "unauthorized") {
    return jsonError(
      c,
      401,
      "UNAUTHORIZED",
      "Missing or invalid x-api-key header.",
    );
  }

  const rateResult = publicApiRateLimiter.check(authResult.key);
  if (!rateResult.allowed) {
    const retryAfterSeconds = rateResult.retryAfter ?? 60;
    c.header("Retry-After", String(retryAfterSeconds));
    return jsonError(
      c,
      429,
      "RATE_LIMITED",
      `Rate limit exceeded. Maximum 60 requests per minute. Retry after ${retryAfterSeconds}s.`,
      { retryAfter: retryAfterSeconds },
    );
  }

  await next();
});

/**
 * GET /api/v1/signals?symbol=&status=&limit=
 * Returns filtered signal records from database.
 */
publicApi.get("/signals", async (c) => {
  const symbol = c.req.query("symbol")?.trim();
  if (symbol && !VALID_SYMBOLS.has(symbol)) {
    return jsonError(
      c,
      400,
      "BAD_REQUEST",
      `Invalid symbol '${symbol}'. Valid symbols: ${Array.from(VALID_SYMBOLS).join(", ")}`,
    );
  }

  const status = c.req.query("status")?.trim();
  if (status && !VALID_STATUSES.includes(status as SignalStatus)) {
    return jsonError(
      c,
      400,
      "BAD_REQUEST",
      `Invalid status '${status}'. Valid statuses: ${VALID_STATUSES.join(", ")}`,
    );
  }

  const limitParam = c.req.query("limit")?.trim();
  let limit = 50;
  if (limitParam !== undefined && limitParam !== "") {
    const parsedLimit = Number(limitParam);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return jsonError(
        c,
        400,
        "BAD_REQUEST",
        "Invalid limit. Limit must be an integer between 1 and 100.",
      );
    }
    limit = parsedLimit;
  }

  const signalsList = await listSignals({
    symbol: symbol || null,
    status: (status as SignalStatus) || null,
    limit,
  });

  return jsonEnvelope(c, signalsList, signalsList.length, "public, max-age=30");
});

/**
 * GET /api/v1/signals/:id
 * Returns a single signal by numerical ID or 404.
 */
publicApi.get("/signals/:id", async (c) => {
  const rawId = c.req.param("id");
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(
      c,
      400,
      "BAD_REQUEST",
      "Invalid signal ID. ID must be a positive integer.",
    );
  }

  const signal = await getSignalById(id);
  if (!signal) {
    return jsonError(c, 404, "NOT_FOUND", `Signal with ID ${id} not found.`);
  }

  return jsonEnvelope(c, signal, 1);
});

/**
 * GET /api/v1/track-record
 * Returns overall track record and performance metrics.
 */
publicApi.get("/track-record", async (c) => {
  const trackRecord = await computeTrackRecord();
  return jsonEnvelope(c, trackRecord, 1, "public, max-age=300");
});

/**
 * GET /api/v1/instruments
 * Returns covered instrument definitions and proxies.
 */
publicApi.get("/instruments", (c) => {
  return jsonEnvelope(c, INSTRUMENTS, INSTRUMENTS.length, "public, max-age=3600");
});
