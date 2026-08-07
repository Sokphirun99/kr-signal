import { describe, it, expect } from "vitest";
import { gateSetup, scoreSetup } from "./gate";
import type { Setup } from "./strategy";

function createMockSetup(overrides?: Partial<Setup['context']>): Setup {
  return {
    timeframe: "15m",
    style: "trend",
    side: "buy",
    entry: 100,
    stopLoss: 95,
    tp1: 107.5,
    tp2: 112.5,
    tp3: 120,
    setupAt: Date.now(),
    context: {
      atr: 2,
      rsi: 40,
      emaFast: 100.5,
      emaSlow: 99.5,
      atrPct: 0.3,
      regime: "trending",
      rvol: 1.0,
      squeeze: 0,
      adx: null,
      bullishDivergence: false,
      bearishDivergence: false,
      takerRatio: null,
      fearAndGreed: null,
      ...overrides,
    },
  };
}

describe("Gate Scoring", () => {
  it("scores baseline trend setup correctly", () => {
    const setup = createMockSetup();
    const score = scoreSetup(setup);
    expect(score).toBeGreaterThanOrEqual(60);
  });

  it("applies ADX score boost for strong trends", () => {
    const highAdx = createMockSetup({ adx: 30 });
    const lowAdx = createMockSetup({ adx: 15 });
    expect(scoreSetup(highAdx)).toBeGreaterThan(scoreSetup(lowAdx));
  });

  it("applies RSI bullish divergence bonus for buys", () => {
    const normal = createMockSetup({ bullishDivergence: false });
    const div = createMockSetup({ bullishDivergence: true });
    expect(scoreSetup(div)).toBe(scoreSetup(normal) + 8);
  });

  it("applies Taker Buy/Sell ratio scoring", () => {
    const bullishTaker = createMockSetup({ takerRatio: 1.3 });
    const bearishTaker = createMockSetup({ takerRatio: 0.7 });
    expect(scoreSetup(bullishTaker)).toBeGreaterThan(scoreSetup(bearishTaker));
  });

  it("applies Fear & Greed scoring for range buys", () => {
    const rangeSetup = createMockSetup({
      regime: "ranging",
      fearAndGreed: 15,
    });
    rangeSetup.style = "range";
    const scoreWithExtremeFear = scoreSetup(rangeSetup);

    const rangeSetupNeutral = createMockSetup({
      regime: "ranging",
      fearAndGreed: 50,
    });
    rangeSetupNeutral.style = "range";
    const scoreNeutral = scoreSetup(rangeSetupNeutral);

    expect(scoreWithExtremeFear).toBe(scoreNeutral + 5);
  });

  it("vetoes Gold setups outside active London/NY sessions", () => {
    const setup = createMockSetup();
    // 03:00 UTC (Asian lull)
    setup.setupAt = new Date("2026-08-07T03:00:00Z").getTime();
    const result = gateSetup(setup, false, { symbol: "XAUUSD" });
    expect(result.pass).toBe(false);
    expect(result.reasons).toContain("gold-off-session");
  });

  it("passes Gold setups during active NY session", () => {
    const setup = createMockSetup();
    // 14:00 UTC (NY Session, Friday)
    setup.setupAt = new Date("2026-08-07T14:00:00Z").getTime();
    const result = gateSetup(setup, false, { symbol: "XAUUSD" });
    expect(result.reasons).not.toContain("gold-off-session");
  });

  it("vetoes Forex setups outside active London/NY sessions", () => {
    const setup = createMockSetup();
    // 02:00 UTC (Asian lull)
    setup.setupAt = new Date("2026-08-07T02:00:00Z").getTime();
    const result = gateSetup(setup, false, { symbol: "EURUSD" });
    expect(result.pass).toBe(false);
    expect(result.reasons).toContain("forex-off-session");
  });

  it("passes Forex setups during active London session", () => {
    const setup = createMockSetup();
    // 09:00 UTC (London Session, Friday)
    setup.setupAt = new Date("2026-08-07T09:00:00Z").getTime();
    const result = gateSetup(setup, false, { symbol: "EURUSD" });
    expect(result.reasons).not.toContain("forex-off-session");
  });
});
