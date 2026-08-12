import { describe, expect, it } from "vitest";
import {
  getEffectiveSignalExpiry,
  getSignalExpiryMs,
} from "@contracts/instruments";

const HOUR_MS = 60 * 60_000;

describe("signal expiry policy", () => {
  it("uses standardized 12-16 candle validity windows across all markets", () => {
    expect(getSignalExpiryMs("crypto", "15m")).toBe(4 * HOUR_MS);
    expect(getSignalExpiryMs("crypto", "1h")).toBe(12 * HOUR_MS);
    expect(getSignalExpiryMs("crypto", "4h")).toBe(48 * HOUR_MS);

    expect(getSignalExpiryMs("gold", "15m")).toBe(4 * HOUR_MS);
    expect(getSignalExpiryMs("gold", "1h")).toBe(12 * HOUR_MS);
    expect(getSignalExpiryMs("gold", "4h")).toBe(48 * HOUR_MS);

    expect(getSignalExpiryMs("forex", "15m")).toBe(4 * HOUR_MS);
    expect(getSignalExpiryMs("forex", "1h")).toBe(12 * HOUR_MS);
    expect(getSignalExpiryMs("forex", "4h")).toBe(48 * HOUR_MS);
  });

  it("caps legacy long-duration signals across all markets without extending earlier deadlines", () => {
    const openedAt = new Date("2026-08-09T13:00:00Z");
    const oldFourDayExpiry = new Date("2026-08-13T13:00:00Z");
    const alreadyShorterExpiry = new Date("2026-08-10T13:00:00Z");

    // Crypto 4h
    expect(
      getEffectiveSignalExpiry("crypto", "4h", openedAt, oldFourDayExpiry)
    ).toEqual(new Date("2026-08-11T13:00:00Z"));
    expect(
      getEffectiveSignalExpiry("crypto", "4h", openedAt, alreadyShorterExpiry)
    ).toEqual(alreadyShorterExpiry);

    // Gold 4h legacy 4-day expiry capped to 48h (2 days)
    expect(
      getEffectiveSignalExpiry("gold", "4h", openedAt, oldFourDayExpiry)
    ).toEqual(new Date("2026-08-11T13:00:00Z"));
    expect(
      getEffectiveSignalExpiry("gold", "4h", openedAt, alreadyShorterExpiry)
    ).toEqual(alreadyShorterExpiry);
  });
});
