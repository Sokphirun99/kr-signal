import { describe, it, expect } from "vitest";
import {
  vwapSeries,
  bollingerBandsSeries,
  ttmSqueezeSeries,
  adxSeries,
  rsiDivergence,
  rsiSeries,
} from "./indicators";
import type { Candle } from "./binance";

function generateCandles(count: number, basePrice = 100): Candle[] {
  const candles: Candle[] = [];
  const t0 = new Date("2026-01-01T00:00:00Z").getTime();
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const variation = (i % 2 === 0 ? 1 : -1) * 2;
    price += variation;
    candles.push({
      openTime: t0 + i * 3600_000,
      open: price - variation,
      high: price + 2,
      low: price - 2,
      close: price,
      volume: 100,
    });
  }
  return candles;
}

describe("Technical Indicators", () => {
  it("calculates session VWAP correctly", () => {
    const candles = generateCandles(5, 100);
    const vwap = vwapSeries(candles);
    expect(vwap.length).toBe(5);
    expect(vwap[0]).not.toBeNull();
    expect(vwap[4]).toBeGreaterThan(90);
  });

  it("calculates Bollinger Bands and percentB", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    const bb = bollingerBandsSeries(closes, 20, 2.0);
    expect(bb.middle[19]).not.toBeNull();
    expect(bb.upper[19]!).toBeGreaterThan(bb.middle[19]!);
    expect(bb.lower[19]!).toBeLessThan(bb.middle[19]!);
    expect(bb.percentB[19]).toBeGreaterThanOrEqual(0);
    expect(bb.percentB[19]).toBeLessThanOrEqual(1.5);
  });

  it("detects TTM Squeeze state", () => {
    const candles = generateCandles(40, 100);
    const squeeze = ttmSqueezeSeries(candles);
    expect(squeeze.length).toBe(40);
    expect(typeof squeeze[30]).toBe("boolean");
  });

  it("calculates ADX series", () => {
    const candles = generateCandles(50, 100);
    const { adx, plusDi, minusDi } = adxSeries(candles, 14);
    expect(adx.length).toBe(50);
    expect(adx[40]).not.toBeNull();
    expect(plusDi[30]).not.toBeNull();
    expect(minusDi[30]).not.toBeNull();
  });

  it("detects RSI divergence", () => {
    const candles = generateCandles(30, 100);
    const closes = candles.map((c) => c.close);
    const rsi = rsiSeries(closes, 14);
    const result = rsiDivergence(candles, rsi, 25, 20);
    expect(typeof result.bullishDivergence).toBe("boolean");
    expect(typeof result.bearishDivergence).toBe("boolean");
  });
});

