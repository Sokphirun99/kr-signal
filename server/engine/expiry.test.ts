import { describe, expect, it } from "vitest";
import {
  getEffectiveSignalExpiry,
  getSignalExpiryMs,
} from "@contracts/instruments";

const HOUR_MS = 60 * 60_000;

describe("signal expiry policy", () => {
  it("uses shorter validity windows for crypto", () => {
    expect(getSignalExpiryMs("crypto", "15m")).toBe(4 * HOUR_MS);
    expect(getSignalExpiryMs("crypto", "1h")).toBe(12 * HOUR_MS);
    expect(getSignalExpiryMs("crypto", "4h")).toBe(48 * HOUR_MS);
  });

  it("keeps the existing slower windows for gold and forex", () => {
    expect(getSignalExpiryMs("gold", "15m")).toBe(8 * HOUR_MS);
    expect(getSignalExpiryMs("gold", "1h")).toBe(24 * HOUR_MS);
    expect(getSignalExpiryMs("gold", "4h")).toBe(96 * HOUR_MS);
    expect(getSignalExpiryMs("forex", "4h")).toBe(96 * HOUR_MS);
  });

  it("caps existing crypto signals without extending earlier deadlines", () => {
    const openedAt = new Date("2026-08-09T13:00:00Z");
    const oldFourDayExpiry = new Date("2026-08-13T13:00:00Z");
    const alreadyShorterExpiry = new Date("2026-08-10T13:00:00Z");

    expect(
      getEffectiveSignalExpiry("crypto", "4h", openedAt, oldFourDayExpiry)
    ).toEqual(new Date("2026-08-11T13:00:00Z"));
    expect(
      getEffectiveSignalExpiry("crypto", "4h", openedAt, alreadyShorterExpiry)
    ).toEqual(alreadyShorterExpiry);
  });
});
