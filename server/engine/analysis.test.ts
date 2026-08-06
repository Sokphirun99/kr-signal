import { describe, expect, it } from "vitest";
import { analyzeTechnicalData } from "./analysis";
import type { Candle } from "./binance";

function buildCandles(count: number): Candle[] {
  const start = new Date("2026-01-01T00:00:00Z").getTime();
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.4 + (index % 3 - 1) * 0.2;
    return {
      openTime: start + index * 3_600_000,
      open: close - 0.3,
      high: close + 0.8,
      low: close - 0.9,
      close,
      volume: 1_000 + (index % 5) * 100,
    };
  });
}

describe("technical analysis snapshot", () => {
  it("returns the engine's indicator values for the most recent closed candle", () => {
    const candles = buildCandles(140);
    const analysis = analyzeTechnicalData(candles);

    expect(analysis).not.toBeNull();
    expect(analysis?.currentPrice).toBe(candles[139].close);
    expect(analysis?.ema20).toBeGreaterThan(analysis?.ema50 ?? 0);
    expect(analysis?.rsi14).toBeGreaterThan(50);
    expect(analysis?.relativeVolume).toBeGreaterThan(0);
    expect(analysis?.directionalBias).toBe("bullish");
  });

  it("requires enough history to match the strategy engine", () => {
    expect(analyzeTechnicalData(buildCandles(119))).toBeNull();
  });
});
