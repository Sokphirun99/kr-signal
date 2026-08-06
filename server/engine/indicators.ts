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


