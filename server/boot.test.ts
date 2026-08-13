import { describe, expect, it } from "vitest";
import app from "./boot";

describe("server request limits", () => {
  it("rejects a request over the 1 MiB general body limit", async () => {
    const response = await app.request("/api/health", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(1024 * 1024 + 1),
      },
      body: JSON.stringify({ payload: "x".repeat(1024 * 1024) }),
    });

    expect(response.status).toBe(413);
  });
});
