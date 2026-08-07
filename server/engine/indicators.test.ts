import { describe, it, expect } from "vitest";
import {
  vwapSeries,
  vwapAt,
  bollingerBandsSeries,
  bollingerBandsAt,
  calculateBandPoint,
  ttmSqueezeSeries,
  ttmSqueezeAt,
  adxSeries,
  rsiDivergence,
  rsiSeries,
  emaSeries,
  atrSeries,
  atrPercentile,
  atrPercentileAtIndex,
  squeezeLength,
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

  it("calculates session VWAP at a specific index matching the series", () => {
    const candles = generateCandles(10, 100);
    const vwapFull = vwapSeries(candles);
    for (let i = 0; i < candles.length; i++) {
      expect(vwapAt(candles, i)).toBeCloseTo(vwapFull[i]!, 6);
    }
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

  it("matches ground-truth two-pass Bollinger Bands calculations across historical closes", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 1000 + Math.sin(i * 0.5) * 50 + (i % 3) * 5);
    const period = 20;
    const bb = bollingerBandsSeries(closes, period, 2.0);

    for (let i = period - 1; i < closes.length; i++) {
      const slice = closes.slice(i - period + 1, i + 1);
      const expectedMean = slice.reduce((a, b) => a + b, 0) / period;
      const expectedVar = slice.reduce((a, b) => a + Math.pow(b - expectedMean, 2), 0) / period;
      const expectedStd = Math.sqrt(expectedVar);
      const expectedUpper = expectedMean + expectedStd * 2.0;
      const expectedLower = expectedMean - expectedStd * 2.0;
      const expectedPercentB = (closes[i] - expectedLower) / (expectedUpper - expectedLower);

      expect(bb.middle[i]).toBeCloseTo(expectedMean, 6);
      expect(bb.upper[i]).toBeCloseTo(expectedUpper, 6);
      expect(bb.lower[i]).toBeCloseTo(expectedLower, 6);
      expect(bb.percentB[i]).toBeCloseTo(expectedPercentB, 6);
    }
  });

  it("clamps variance to zero on constant prices without producing NaN", () => {
    const closes = new Array(30).fill(65432.1);
    const bb = bollingerBandsSeries(closes, 20, 2.0);
    expect(bb.middle[25]).toBeCloseTo(65432.1, 6);
    expect(bb.upper[25]).toBeCloseTo(65432.1, 6);
    expect(bb.lower[25]).toBeCloseTo(65432.1, 6);
    expect(bb.percentB[25]).toBe(0.5);
  });

  it("calculates bollingerBandsAt matching the full series at any index", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5 + Math.cos(i) * 3);
    const bbSeries = bollingerBandsSeries(closes, 20, 2.0);

    expect(bollingerBandsAt(closes, 5, 20, 2.0)).toBeNull();

    for (let i = 19; i < closes.length; i++) {
      const pt = bollingerBandsAt(closes, i, 20, 2.0);
      expect(pt).not.toBeNull();
      expect(pt!.middle).toBeCloseTo(bbSeries.middle[i]!, 6);
      expect(pt!.upper).toBeCloseTo(bbSeries.upper[i]!, 6);
      expect(pt!.lower).toBeCloseTo(bbSeries.lower[i]!, 6);
      expect(pt!.percentB).toBeCloseTo(bbSeries.percentB[i]!, 6);
    }
  });

  it("calculates calculateBandPoint defensively with negative variance guard", () => {
    const point = calculateBandPoint(100, 100, -0.0000001, 2.0);
    expect(point.upper).toBe(100);
    expect(point.lower).toBe(100);
    expect(point.middle).toBe(100);
    expect(point.percentB).toBe(0.5);
  });

  it("detects TTM Squeeze state", () => {
    const candles = generateCandles(40, 100);
    const squeeze = ttmSqueezeSeries(candles);
    expect(squeeze.length).toBe(40);
    expect(typeof squeeze[30]).toBe("boolean");
  });

  it("evaluates ttmSqueezeAt identically to ttmSqueezeSeries", () => {
    const candles = generateCandles(50, 100);
    const fullSqueeze = ttmSqueezeSeries(candles, 20, 14);
    const closes = candles.map((c) => c.close);
    const ema = emaSeries(closes, 20);
    const atr = atrSeries(candles, 14);

    for (let i = 0; i < candles.length; i++) {
      const atVal = ttmSqueezeAt(candles, i, 20, 14);
      expect(atVal).toBe(fullSqueeze[i]);

      const atWithPrecomputed = ttmSqueezeAt(candles, i, 20, 14, { ema: ema[i], atr: atr[i] });
      expect(atWithPrecomputed).toBe(fullSqueeze[i]);
    }
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

  it("calculates atrPercentileAtIndex with single-pass zero allocations", () => {
    const atr: (number | null)[] = new Array(30).fill(null);
    for (let i = 10; i < 30; i++) {
      atr[i] = (i - 9) * 0.5;
    }
    // At index 29, atr[29] is max of the 20 samples -> percentile 1.0
    expect(atrPercentileAtIndex(atr, 29, 100)).toBeCloseTo(1.0, 6);
    // At index 10, valid count is 1 < 20 -> default 0.5
    expect(atrPercentileAtIndex(atr, 10, 100)).toBe(0.5);
    // Out of bounds
    expect(atrPercentileAtIndex(atr, -1, 100)).toBe(0.5);
    expect(atrPercentileAtIndex(atr, 50, 100)).toBe(0.5);
    expect(atrPercentile(atr)).toBeCloseTo(1.0, 6);
  });

  it("calculates squeezeLength correctly across consecutive low ATR percentile candles", () => {
    const atr: (number | null)[] = [];
    // 50 normal ATR candles around 2.0
    for (let i = 0; i < 50; i++) {
      atr.push(2.0 + (i % 5) * 0.1);
    }
    // 5 compressed ATR candles around 0.2 (percentile < 0.15)
    for (let i = 0; i < 5; i++) {
      atr.push(0.2);
    }
    expect(squeezeLength(atr, atr.length - 1, 20)).toBe(5);
    expect(squeezeLength(atr, -1, 20)).toBe(0);
  });
});

