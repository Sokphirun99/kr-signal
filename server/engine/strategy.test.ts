import { describe, expect, it } from "vitest";
import { buildRangeTargets } from "./strategy";

describe("range target geometry", () => {
  it("builds strictly increasing buy targets", () => {
    expect(buildRangeTargets("buy", 100, 10, 145)).toEqual({
      tp1: 115,
      tp2: 125,
      tp3: 140,
    });
  });

  it("builds strictly decreasing sell targets", () => {
    expect(buildRangeTargets("sell", 100, 10, 55)).toEqual({
      tp1: 85,
      tp2: 75,
      tp3: 60,
    });
  });

  it("rejects a range that would collapse TP3 onto TP2", () => {
    expect(buildRangeTargets("buy", 100, 10, 125)).toBeNull();
    expect(buildRangeTargets("sell", 100, 10, 75)).toBeNull();
  });
});
