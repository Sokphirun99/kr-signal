/**
 * Technical indicators used by the strategy engine.
 * All functions take ascending candle arrays and return aligned series
 * (leading values may be null/NaN until enough data accumulates).
 */

import type { Candle } from "./binance";

export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's ATR */
export function atrSeries(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)),
    );
  }
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += trs[i];
  atr /= period;
  out[period] = atr;
  for (let i = period + 1; i < candles.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    out[i] = atr;
  }
  return out;
}

/** Wilder's RSI on closes */
export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * Recent swing high/low over `lookback` candles ending at `endIdx`
 * (exclusive of the current candle).
 */
export function swingLevels(
  candles: Candle[],
  endIdx: number,
  lookback = 20,
): { swingHigh: number; swingLow: number } {
  const start = Math.max(0, endIdx - lookback);
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  for (let i = start; i < endIdx; i++) {
    swingHigh = Math.max(swingHigh, candles[i].high);
    swingLow = Math.min(swingLow, candles[i].low);
  }
  return { swingHigh, swingLow };
}

/** ATR percentile of the latest value vs its recent history (0–1) */
export function atrPercentile(atr: (number | null)[], lookback = 100): number {
  return atrPercentileAtIndex(atr, atr.length - 1, lookback);
}

/** ATR percentile at a given index vs its trailing history (0–1) */
export function atrPercentileAtIndex(
  atr: (number | null)[],
  idx: number,
  lookback = 100,
): number {
  if (idx < 0 || idx >= atr.length) return 0.5;
  const start = Math.max(0, idx - lookback + 1);
  const vals = atr.slice(start, idx + 1).filter((v): v is number => v !== null && v > 0);
  if (vals.length < 20) return 0.5;
  const current = atr[idx];
  if (current === null || current <= 0) return 0.5;
  const below = vals.filter((v) => v <= current).length;
  return below / vals.length;
}

/**
 * Calculates the count of consecutive recent closed candles where atrPercentile < 0.15.
 */
export function squeezeLength(
  atr: (number | null)[],
  endIdx: number = atr.length - 1,
  lookback = 20,
): number {
  if (endIdx < 0) return 0;

  const maxSearch = lookback * 3;
  let countAtEnd = 0;
  for (let k = endIdx; k >= 0 && k >= endIdx - maxSearch; k--) {
    const pct = atrPercentileAtIndex(atr, k, 100);
    if (pct < 0.15) {
      countAtEnd++;
    } else {
      break;
    }
  }
  if (countAtEnd > 0) return countAtEnd;

  let countPrior = 0;
  for (let k = endIdx - 1; k >= 0 && k >= endIdx - maxSearch; k--) {
    const pct = atrPercentileAtIndex(atr, k, 100);
    if (pct < 0.15) {
      countPrior++;
    } else {
      break;
    }
  }

  return countPrior;
}

/**
 * Session VWAP (Volume Weighted Average Price) calculation.
 * Returns aligned array of cumulative volume-weighted average prices.
 */
export function vwapSeries(candles: Candle[]): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let cumVolume = 0;
  let cumTypicalVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const { high, low, close, volume } = candles[i];
    const typicalPrice = (high + low + close) / 3;
    cumTypicalVolume += typicalPrice * volume;
    cumVolume += volume;
    out[i] = cumVolume > 0 ? cumTypicalVolume / cumVolume : null;
  }
  return out;
}

export interface BollingerBandsResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  percentB: (number | null)[];
}

/**
 * Bollinger Bands calculation.
 */
export function bollingerBandsSeries(
  closes: number[],
  period = 20,
  stdDevMult = 2.0,
): BollingerBandsResult {
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const middle: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  const percentB: (number | null)[] = new Array(closes.length).fill(null);

  if (closes.length < period) {
    return { upper, middle, lower, percentB };
  }

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const u = mean + stdDev * stdDevMult;
    const l = mean - stdDev * stdDevMult;

    middle[i] = mean;
    upper[i] = u;
    lower[i] = l;
    percentB[i] = u === l ? 0.5 : (closes[i] - l) / (u - l);
  }

  return { upper, middle, lower, percentB };
}

/**
 * TTM Squeeze check: Bollinger Bands inside Keltner Channels.
 * Returns true for candle indices where BB upper <= KC upper and BB lower >= KC lower.
 */
export function ttmSqueezeSeries(
  candles: Candle[],
  bbPeriod = 20,
  atrPeriod = 14,
): boolean[] {
  const closes = candles.map((c) => c.close);
  const bb = bollingerBandsSeries(closes, bbPeriod, 2.0);
  const atr = atrSeries(candles, atrPeriod);
  const ema = emaSeries(closes, bbPeriod);

  const squeeze: boolean[] = new Array(candles.length).fill(false);

  for (let i = 0; i < candles.length; i++) {
    const bbu = bb.upper[i];
    const bbl = bb.lower[i];
    const e = ema[i];
    const a = atr[i];

    if (bbu !== null && bbl !== null && e !== null && a !== null) {
      // Keltner Channel bounds (EMA +/- 1.5 * ATR)
      const kcu = e + 1.5 * a;
      const kcl = e - 1.5 * a;
      // Bollinger Bands inside Keltner Channels
      squeeze[i] = bbu <= kcu && bbl >= kcl;
    }
  }

  return squeeze;
}


