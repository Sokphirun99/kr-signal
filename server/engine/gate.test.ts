import { describe, it, expect } from "vitest";
import { scoreSetup } from "./gate";
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
});
