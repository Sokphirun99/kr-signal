/**
 * Read-only technical-analysis snapshot for a completed candle series.
 * These values use the same periods and regime rules as the strategy engine.
 */
import type { Candle } from "./binance";
import {
  adxSeries,
  atrPercentile,
  atrSeries,
  bollingerBandsSeries,
  emaSeries,
  rsiDivergence,
  rsiSeries,
  squeezeLength,
  ttmSqueezeSeries,
  vwapSeries,
} from "./indicators";

export interface TechnicalAnalysis {
  candleOpenTime: number;
  currentPrice: number;
  regime: "trending" | "ranging";
  directionalBias: "bullish" | "bearish" | "neutral";
  ema20: number;
  ema50: number;
  atr14: number;
  atrPercentile: number;
  rsi14: number;
  relativeVolume: number;
  squeezeLength: number;
  vwap: number | null;
  bollingerPercentB: number | null;
  ttmSqueeze: boolean;
  adx14: number | null;
  plusDi14: number | null;
  minusDi14: number | null;
  bullishDivergence: boolean;
  bearishDivergence: boolean;
}

/** Returns null until the engine has enough history for its 50-period EMA. */
export function analyzeTechnicalData(candles: Candle[]): TechnicalAnalysis | null {
  if (candles.length < 120) return null;

  const closes = candles.map((c) => c.close);
  const ema20 = emaSeries(closes, 20);
  const ema50 = emaSeries(closes, 50);
  const atr14 = atrSeries(candles, 14);
  const rsi14 = rsiSeries(closes, 14);
  const i = candles.length - 1;
  const fast = ema20[i];
  const slow = ema50[i];
  const atr = atr14[i];
  const rsi = rsi14[i];
  if (fast === null || slow === null || atr === null || atr <= 0 || rsi === null) return null;

  const candle = candles[i];
  const separation = Math.abs(fast - slow) / atr;
  const regime = separation >= 0.8 ? "trending" : "ranging";
  const directionalBias =
    fast > slow && candle.close > fast
      ? "bullish"
      : fast < slow && candle.close < fast
        ? "bearish"
        : "neutral";

  const volumes = candles.map((c) => c.volume);
  const last20 = volumes.slice(Math.max(0, i - 19), i + 1);
  const averageVolume = last20.reduce((sum, value) => sum + value, 0) / last20.length;
  const relativeVolume = averageVolume > 0 ? candle.volume / averageVolume : 1;
  const bands = bollingerBandsSeries(closes, 20, 2);
  const dmi = adxSeries(candles, 14);
  const divergence = rsiDivergence(candles, rsi14, i, 20);

  return {
    candleOpenTime: candle.openTime,
    currentPrice: candle.close,
    regime,
    directionalBias,
    ema20: fast,
    ema50: slow,
    atr14: atr,
    atrPercentile: atrPercentile(atr14),
    rsi14: rsi,
    relativeVolume,
    squeezeLength: squeezeLength(atr14, i, 20),
    vwap: vwapSeries(candles)[i],
    bollingerPercentB: bands.percentB[i],
    ttmSqueeze: ttmSqueezeSeries(candles, 20, 14)[i],
    adx14: dmi.adx[i],
    plusDi14: dmi.plusDi[i],
    minusDi14: dmi.minusDi[i],
    ...divergence,
  };
}
