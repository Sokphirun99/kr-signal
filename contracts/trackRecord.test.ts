import { describe, expect, it } from "vitest";
import { TERMINAL_STATUSES } from "./instruments";
import { computeTrackRecordFromSignals } from "./trackRecord";

describe("track-record terminal outcomes", () => {
  it("keeps ungraded terminal outcomes out of performance while counting them", () => {
    expect(TERMINAL_STATUSES).toContain("expired");
    expect(TERMINAL_STATUSES).toContain("undecidable");

    const result = computeTrackRecordFromSignals([
      { status: "tp3", rMultiple: 4, market: "crypto", closedAt: new Date() },
      { status: "expired", rMultiple: 0, market: "crypto", closedAt: new Date() },
      { status: "undecidable", rMultiple: 0, market: "crypto", closedAt: new Date() },
    ]);

    expect(result.closed).toBe(1);
    expect(result.expired).toBe(1);
    expect(result.undecidable).toBe(1);
    expect(result.totalR).toBe(4);
  });
});
