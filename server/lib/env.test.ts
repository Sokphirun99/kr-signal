import { describe, expect, it } from "vitest";
import { missingProductionEnv } from "./env";

describe("production environment validation", () => {
  it("requires core secrets and the enabled AI shared secret", () => {
    expect(missingProductionEnv({ NODE_ENV: "production" })).toEqual([
      "DATABASE_URL",
      "APP_SECRET",
      "CRON_SECRET",
      "HF_AI_SHARED_SECRET (required when HF_AI_FORECASTS is enabled)",
    ]);
  });

  it("allows AI to be explicitly disabled without its shared secret", () => {
    expect(
      missingProductionEnv({
        DATABASE_URL: "postgres://example",
        APP_SECRET: "app-secret",
        CRON_SECRET: "cron-secret",
        HF_AI_FORECASTS: "off",
      }),
    ).toEqual([]);
  });
});
