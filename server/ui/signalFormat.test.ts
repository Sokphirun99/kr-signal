import { afterEach, describe, expect, it, vi } from "vitest";
import { getTimeLeft } from "../../src/components/signals/signalFormat";

afterEach(() => vi.useRealTimers());

describe("signal expiry display", () => {
  it("labels a past-due open row as awaiting ledger verification", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T05:00:00.000Z"));

    expect(getTimeLeft(new Date("2026-08-11T04:00:00.000Z"), "open").text).toBe(
      "Awaiting verification"
    );
  });

  it("uses expired only for a terminal ledger row", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T05:00:00.000Z"));

    expect(
      getTimeLeft(new Date("2026-08-11T04:00:00.000Z"), "expired").text
    ).toBe("expired");
  });
});
