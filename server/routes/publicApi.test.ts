import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import app from "../boot";
import * as signalsQueries from "../queries/signals";
import { publicApiRateLimiter } from "../lib/rateLimit";
import type { Signal } from "@db/schema";
import type { TrackRecord } from "@contracts/trackRecord";
import { INSTRUMENTS } from "@contracts/instruments";

interface ApiError {
  code: string;
  message: string;
}

interface ApiResponse<T = unknown> {
  data?: T;
  meta?: { count: number; generatedAt: string };
  error?: ApiError;
  retryAfter?: number;
}

describe("publicApi REST v1", () => {
  const originalEnv = process.env.PUBLIC_API_KEYS;
  const testApiKey = "test-api-key-12345";

  const mockSignal: Signal = {
    id: 1,
    symbol: "BTCUSDT",
    market: "crypto",
    timeframe: "1h",
    style: "trend",
    side: "buy",
    entry: 65000,
    stopLoss: 64000,
    tp1: 66400,
    tp2: 67800,
    tp3: 69200,
    confidence: 85,
    status: "tp1",
    engine: "rules",
    entryFilled: true,
    rMultiple: 1.4,
    exitPrice: 66400,
    setupAt: new Date("2026-08-01T00:00:00.000Z"),
    openedAt: new Date("2026-08-01T01:00:00.000Z"),
    expiresAt: new Date("2026-08-02T01:00:00.000Z"),
    closedAt: new Date("2026-08-01T05:00:00.000Z"),
  };

  const mockTrackRecord: TrackRecord = {
    closed: 10,
    wins: 7,
    nonWins: 3,
    undecidable: 0,
    expired: 1,
    winRate: 70,
    totalR: 8.4,
    avgR: 0.84,
    profitFactor: 2.5,
    bestStreak: 4,
    currentStreak: 2,
    firstOutcomeAt: new Date("2026-08-01T00:00:00.000Z"),
    lastOutcomeAt: new Date("2026-08-01T05:00:00.000Z"),
    byMarket: [{ market: "crypto", closed: 10, wins: 7, winRate: 70 }],
    byMonth: [{ month: "2026-08", closed: 10, wins: 7, winRate: 70 }],
    equityCurve: [],
  };

  beforeEach(() => {
    process.env.PUBLIC_API_KEYS = `${testApiKey},another-key-67890`;
    publicApiRateLimiter.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.PUBLIC_API_KEYS = originalEnv;
    publicApiRateLimiter.reset();
    vi.restoreAllMocks();
  });

  describe("PART 1 & 2: Authentication & Rate Limiting", () => {
    it("returns 401 when no x-api-key header is provided", async () => {
      const res = await app.request("/api/v1/signals");
      expect(res.status).toBe(401);
      const body = (await res.json()) as ApiResponse;
      expect(body.error?.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 when an invalid x-api-key is provided", async () => {
      const res = await app.request("/api/v1/signals", {
        headers: { "x-api-key": "invalid-wrong-key" },
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as ApiResponse;
      expect(body.error?.code).toBe("UNAUTHORIZED");
    });

    it("returns 503 when PUBLIC_API_KEYS is unset or empty", async () => {
      delete process.env.PUBLIC_API_KEYS;
      const res = await app.request("/api/v1/signals", {
        headers: { "x-api-key": testApiKey },
      });
      expect(res.status).toBe(503);
      const body = (await res.json()) as ApiResponse;
      expect(body.error?.code).toBe("API_DISABLED");
    });

    it("returns 200 with envelope shape on valid x-api-key", async () => {
      vi.spyOn(signalsQueries, "listSignals").mockResolvedValue([mockSignal]);

      const res = await app.request("/api/v1/signals", {
        headers: { "x-api-key": testApiKey },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as ApiResponse<Signal[]>;
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("meta");
      expect(body.meta?.count).toBe(1);
      expect(typeof body.meta?.generatedAt).toBe("string");
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data?.[0].symbol).toBe("BTCUSDT");
    });

    it("enforces sliding window rate limit: 61st request in a minute returns 429", async () => {
      vi.spyOn(signalsQueries, "listSignals").mockResolvedValue([]);

      for (let i = 0; i < 60; i++) {
        const res = await app.request("/api/v1/signals", {
          headers: { "x-api-key": testApiKey },
        });
        expect(res.status).toBe(200);
      }

      const throttledRes = await app.request("/api/v1/signals", {
        headers: { "x-api-key": testApiKey },
      });
      expect(throttledRes.status).toBe(429);
      expect(throttledRes.headers.get("Retry-After")).toBeTruthy();
      const body = (await throttledRes.json()) as ApiResponse;
      expect(body.error?.code).toBe("RATE_LIMITED");
      expect(body.retryAfter).toBeGreaterThan(0);
    });
  });

  describe("PART 3: Routes & Invariants", () => {
    it("rejects non-GET HTTP methods with 405 Method Not Allowed", async () => {
      const methods = ["POST", "PUT", "DELETE", "PATCH"];
      for (const method of methods) {
        const res = await app.request("/api/v1/signals", {
          method,
          headers: { "x-api-key": testApiKey },
        });
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toContain("GET");
        const body = (await res.json()) as ApiResponse;
        expect(body.error?.code).toBe("METHOD_NOT_ALLOWED");
      }
    });

    it("validates query parameters on GET /api/v1/signals", async () => {
      const bogusStatusRes = await app.request("/api/v1/signals?status=bogus", {
        headers: { "x-api-key": testApiKey },
      });
      expect(bogusStatusRes.status).toBe(400);
      const bogusBody = (await bogusStatusRes.json()) as ApiResponse;
      expect(bogusBody.error?.code).toBe("BAD_REQUEST");

      const bogusSymbolRes = await app.request("/api/v1/signals?symbol=UNKNOWN", {
        headers: { "x-api-key": testApiKey },
      });
      expect(bogusSymbolRes.status).toBe(400);

      const limitHighRes = await app.request("/api/v1/signals?limit=9999", {
        headers: { "x-api-key": testApiKey },
      });
      expect(limitHighRes.status).toBe(400);

      const limitNegativeRes = await app.request("/api/v1/signals?limit=-10", {
        headers: { "x-api-key": testApiKey },
      });
      expect(limitNegativeRes.status).toBe(400);
    });

    it("passes valid filters to listSignals and sets Cache-Control header", async () => {
      const listSpy = vi.spyOn(signalsQueries, "listSignals").mockResolvedValue([mockSignal]);

      const res = await app.request("/api/v1/signals?symbol=BTCUSDT&status=open&limit=25", {
        headers: { "x-api-key": testApiKey },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=30");
      expect(listSpy).toHaveBeenCalledWith({
        symbol: "BTCUSDT",
        status: "open",
        limit: 25,
      });
    });

    it("returns single signal on GET /api/v1/signals/:id or 404 when missing", async () => {
      vi.spyOn(signalsQueries, "getSignalById").mockImplementation(
        async (id: number): Promise<Signal | null> => {
          if (id === 1) return mockSignal;
          return null;
        },
      );

      const successRes = await app.request("/api/v1/signals/1", {
        headers: { "x-api-key": testApiKey },
      });
      expect(successRes.status).toBe(200);
      const successBody = (await successRes.json()) as ApiResponse<Signal>;
      expect(successBody.data?.id).toBe(1);
      expect(successBody.meta?.count).toBe(1);

      const notFoundRes = await app.request("/api/v1/signals/999999", {
        headers: { "x-api-key": testApiKey },
      });
      expect(notFoundRes.status).toBe(404);
      const notFoundBody = (await notFoundRes.json()) as ApiResponse;
      expect(notFoundBody.error?.code).toBe("NOT_FOUND");

      const invalidIdRes = await app.request("/api/v1/signals/abc", {
        headers: { "x-api-key": testApiKey },
      });
      expect(invalidIdRes.status).toBe(400);
    });

    it("returns track record on GET /api/v1/track-record with Cache-Control", async () => {
      vi.spyOn(signalsQueries, "computeTrackRecord").mockResolvedValue(mockTrackRecord);

      const res = await app.request("/api/v1/track-record", {
        headers: { "x-api-key": testApiKey },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
      const body = (await res.json()) as ApiResponse<TrackRecord>;
      expect(body.data?.winRate).toBe(70);
      expect(body.meta?.count).toBe(1);
    });

    it("returns covered instruments registry on GET /api/v1/instruments", async () => {
      const res = await app.request("/api/v1/instruments", {
        headers: { "x-api-key": testApiKey },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as ApiResponse<typeof INSTRUMENTS>;
      expect(body.data?.length).toBe(INSTRUMENTS.length);
      expect(body.meta?.count).toBe(INSTRUMENTS.length);
      expect(body.data?.map((i) => i.symbol)).toContain("BTCUSDT");
    });
  });

  describe("PART 4: OpenAPI & Static Source Verification", () => {
    it("serves static openapi.yaml without requiring an API key", async () => {
      delete process.env.PUBLIC_API_KEYS;
      const res = await app.request("/api/v1/openapi.yaml");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("openapi: 3.0.3");
      expect(text).toContain("/signals");
      expect(text).toContain("/track-record");
      expect(text).toContain("/instruments");
    });

    it("statically verifies that publicApi routes NEVER import or reference ensureFresh", () => {
      const publicApiFilePath = path.resolve(process.cwd(), "server/routes/publicApi.ts");
      const source = fs.readFileSync(publicApiFilePath, "utf-8");
      expect(source).not.toContain("ensureFresh");
      expect(source).not.toContain("forceRunPipelinePass");
      expect(source).not.toContain("pipeline");
    });

    it("statically verifies that rateLimit, apiKeys, and safeCompare have no pipeline imports", () => {
      const files = [
        "server/lib/rateLimit.ts",
        "server/lib/apiKeys.ts",
        "server/lib/safeCompare.ts",
      ];
      for (const relPath of files) {
        const fullPath = path.resolve(process.cwd(), relPath);
        const source = fs.readFileSync(fullPath, "utf-8");
        expect(source).not.toContain("ensureFresh");
      }
    });
  });
});
