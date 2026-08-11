import { describe, expect, it } from "vitest";
import { TERMINAL_STATUSES } from "./instruments";
import {
  MAX_EQUITY_CURVE_POINTS,
  computeTrackRecordFromSignals,
} from "./trackRecord";

describe("track-record terminal outcomes", () => {
  it("keeps ungraded terminal outcomes out of performance while counting them", () => {
    expect(TERMINAL_STATUSES).toContain("expired");
    expect(TERMINAL_STATUSES).toContain("undecidable");

    const result = computeTrackRecordFromSignals([
      { status: "tp3", rMultiple: 4, market: "crypto", closedAt: new Date() },
      {
        status: "expired",
        rMultiple: 0,
        market: "crypto",
        closedAt: new Date(),
      },
      {
        status: "undecidable",
        rMultiple: 0,
        market: "crypto",
        closedAt: new Date(),
      },
    ]);

    expect(result.closed).toBe(1);
    expect(result.expired).toBe(1);
    expect(result.undecidable).toBe(1);
    expect(result.totalR).toBe(4);
  });

  it("bounds the public equity curve while preserving its final point", () => {
    const rows = Array.from(
      { length: MAX_EQUITY_CURVE_POINTS + 100 },
      (_, index) => ({
        status: "tp1" as const,
        rMultiple: 1,
        market: "crypto",
        closedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      })
    );

    const result = computeTrackRecordFromSignals(rows);

    expect(result.closed).toBe(rows.length);
    expect(result.totalR).toBe(rows.length);
    expect(result.equityCurve).toHaveLength(MAX_EQUITY_CURVE_POINTS);
    expect(result.equityCurve.at(-1)?.cumulativeR).toBe(rows.length);
  });
});
