import { describe, expect, it } from "vitest";
import {
  disableResponseCache,
  setPublicReadCache,
  type TrpcContext,
} from "./context";
import app from "./boot";

function createTestContext(): TrpcContext {
  return {
    req: new Request("https://example.com/api/trpc"),
    resHeaders: new Headers(),
  };
}

describe("public read cache policy", () => {
  it("sets browser revalidation and shared CDN freshness", () => {
    const ctx = createTestContext();

    setPublicReadCache(ctx, 30, 120);

    expect(ctx.resHeaders.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate"
    );
    expect(ctx.resHeaders.get("CDN-Cache-Control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=120"
    );
    expect(ctx.resHeaders.get("Vercel-CDN-Cache-Control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=120"
    );
  });

  it("uses the shortest lifetime when tRPC batches public reads", () => {
    const ctx = createTestContext();

    setPublicReadCache(ctx, 300, 900);
    setPublicReadCache(ctx, 30, 60);

    expect(ctx.resHeaders.get("Vercel-CDN-Cache-Control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=60"
    );
  });

  it("removes shared caching when a response contains an error", () => {
    const ctx = createTestContext();
    setPublicReadCache(ctx, 300, 900);

    disableResponseCache(ctx.resHeaders);

    expect(ctx.resHeaders.get("Cache-Control")).toBe("private, no-store");
    expect(ctx.resHeaders.has("CDN-Cache-Control")).toBe(false);
    expect(ctx.resHeaders.has("Vercel-CDN-Cache-Control")).toBe(false);
  });
});

describe("public tRPC request limits", () => {
  it("rejects batch amplification", async () => {
    const response = await app.request("/api/trpc/ping,ping?batch=1");

    expect(response.status).toBe(400);
  });

  it("rejects oversized JSON before parsing", async () => {
    const response = await app.request("/api/trpc/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "x".repeat(70 * 1024) }),
    });

    expect(response.status).toBe(413);
  });
});
