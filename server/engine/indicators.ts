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

const DEFAULT_ATR_PERCENTILE_LOOKBACK = 100;
const MIN_ATR_PERCENTILE_SAMPLES = 20;
const SQUEEZE_ATR_PERCENTILE_THRESHOLD = 0.15;
const SQUEEZE_LOOKBACK_MULTIPLIER = 3;

/**
 * ATR percentile of the latest value vs its recent history (0–1).
 * Inputs: atr series array, optional lookback (default 100).
 * Outputs: percentile rank between 0 and 1 (default 0.5 when unready).
 * Side effects: none.
 * Failure modes: returns 0.5 on insufficient samples.
 */
export function atrPercentile(
  atr: (number | null)[],
  lookback = DEFAULT_ATR_PERCENTILE_LOOKBACK,
): number {
  return atrPercentileAtIndex(atr, atr.length - 1, lookback);
}

/**
 * Calculates ATR percentile at a given index vs trailing history in a single O(lookback) pass.
 * Inputs: atr series array, target index, optional lookback (default 100).
 * Outputs: percentile rank between 0 and 1.
 * Side effects: none (zero array allocations).
 * Failure modes: returns 0.5 if index is invalid or valid samples < 20.
 */
export function atrPercentileAtIndex(
  atr: (number | null)[],
  idx: number,
  lookback = DEFAULT_ATR_PERCENTILE_LOOKBACK,
): number {
  if (idx < 0 || idx >= atr.length) return 0.5;
  const current = atr[idx];
  if (current === null || current <= 0) return 0.5;

  const start = Math.max(0, idx - lookback + 1);
  let totalValid = 0;
  let below = 0;

  for (let i = start; i <= idx; i++) {
    const val = atr[i];
    if (val !== null && val > 0) {
      totalValid++;
      if (val <= current) below++;
    }
  }

  if (totalValid < MIN_ATR_PERCENTILE_SAMPLES) return 0.5;
  return below / totalValid;
}

function countConsecutiveSqueeze(
  atr: (number | null)[],
  startIdx: number,
  maxSteps: number,
): number {
  let count = 0;
  const minIdx = Math.max(0, startIdx - maxSteps);
  for (let k = startIdx; k >= minIdx; k--) {
    if (atrPercentileAtIndex(atr, k, DEFAULT_ATR_PERCENTILE_LOOKBACK) < SQUEEZE_ATR_PERCENTILE_THRESHOLD) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Calculates the count of consecutive recent closed candles where atrPercentile < 0.15.
 * Inputs: atr series array, optional endIdx (default atr.length - 1), optional lookback (default 20).
 * Outputs: consecutive count of squeeze candles.
 * Side effects: none.
 * Failure modes: returns 0 if endIdx is negative or out of bounds.
 */
export function squeezeLength(
  atr: (number | null)[],
  endIdx: number = atr.length - 1,
  lookback = 20,
): number {
  if (endIdx < 0 || endIdx >= atr.length) return 0;
  const maxSteps = lookback * SQUEEZE_LOOKBACK_MULTIPLIER;
  const countAtEnd = countConsecutiveSqueeze(atr, endIdx, maxSteps);
  if (countAtEnd > 0) return countAtEnd;
  return countConsecutiveSqueeze(atr, endIdx - 1, maxSteps);
}

const DEFAULT_BB_PERIOD = 20;
const DEFAULT_BB_STD_DEV_MULT = 2.0;
const DEFAULT_ATR_PERIOD = 14;
const KELTNER_ATR_MULT = 1.5;

/**
 * Session VWAP (Volume Weighted Average Price) calculation.
 * Inputs: candles array.
 * Outputs: aligned array of cumulative volume-weighted average prices.
 * Side effects: none.
 * Failure modes: fills leading or empty volume periods with null.
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

/**
 * Calculates session VWAP at a specific candle index without allocating a full series.
 * Inputs: candles array, target index.
 * Outputs: cumulative volume-weighted average price or null.
 * Side effects: none.
 * Failure modes: returns null if idx is out of bounds or total volume is 0.
 */
export function vwapAt(candles: Candle[], idx: number): number | null {
  if (idx < 0 || idx >= candles.length) return null;
  let cumVolume = 0;
  let cumTypicalVolume = 0;
  for (let i = 0; i <= idx; i++) {
    const { high, low, close, volume } = candles[i];
    cumTypicalVolume += ((high + low + close) / 3) * volume;
    cumVolume += volume;
  }
  return cumVolume > 0 ? cumTypicalVolume / cumVolume : null;
}

export interface BollingerBandPoint {
  upper: number;
  middle: number;
  lower: number;
  percentB: number;
}

export interface BollingerBandsResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  percentB: (number | null)[];
}

export interface TtmSqueezeContext {
  ema?: number | null;
  atr?: number | null;
}

/**
 * Computes Bollinger Band levels and percentB for a given mean and variance.
 * Inputs: close price, window mean, window variance, standard deviation multiplier.
 * Outputs: BollingerBandPoint object with computed levels.
 * Side effects: none (pure calculation).
 * Failure modes: clamps negative variance to 0 to prevent NaN under floating-point cancellation.
 */
export function calculateBandPoint(
  close: number,
  mean: number,
  variance: number,
  stdDevMult: number,
): BollingerBandPoint {
  const stdDev = Math.sqrt(Math.max(0, variance));
  const upper = mean + stdDev * stdDevMult;
  const lower = mean - stdDev * stdDevMult;
  const percentB = upper === lower ? 0.5 : (close - lower) / (upper - lower);
  return { upper, middle: mean, lower, percentB };
}

/**
 * Calculates Bollinger Bands at a single specific candle index without array slicing allocations.
 * Inputs: closes array, target index, optional period (default 20), optional stdDev multiplier (default 2.0).
 * Outputs: BollingerBandPoint or null if insufficient history.
 * Side effects: none.
 * Failure modes: returns null if index is out of bounds or index < period - 1.
 */
export function bollingerBandsAt(
  closes: number[],
  idx: number,
  period = DEFAULT_BB_PERIOD,
  stdDevMult = DEFAULT_BB_STD_DEV_MULT,
): BollingerBandPoint | null {
  if (idx < period - 1 || idx >= closes.length) return null;
  const start = idx - period + 1;
  let sum = 0;
  for (let i = start; i <= idx; i++) {
    sum += closes[i];
  }
  const mean = sum / period;
  let varianceSum = 0;
  for (let i = start; i <= idx; i++) {
    const diff = closes[i] - mean;
    varianceSum += diff * diff;
  }
  const variance = varianceSum / period;
  return calculateBandPoint(closes[idx], mean, variance, stdDevMult);
}

function setBandSeriesAt(
  upper: (number | null)[],
  middle: (number | null)[],
  lower: (number | null)[],
  percentB: (number | null)[],
  idx: number,
  point: BollingerBandPoint,
): void {
  upper[idx] = point.upper;
  middle[idx] = point.middle;
  lower[idx] = point.lower;
  percentB[idx] = point.percentB;
}

/**
 * Calculates Bollinger Bands across price closes without intermediate slice allocations.
 * Inputs: closes array, optional period (default 20), optional stdDev multiplier (default 2.0).
 * Outputs: BollingerBandsResult containing aligned null-padded series.
 * Side effects: none.
 * Failure modes: returns all-null series if closes length < period.
 */
export function bollingerBandsSeries(
  closes: number[],
  period = DEFAULT_BB_PERIOD,
  stdDevMult = DEFAULT_BB_STD_DEV_MULT,
): BollingerBandsResult {
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const middle: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  const percentB: (number | null)[] = new Array(closes.length).fill(null);

  if (closes.length < period) return { upper, middle, lower, percentB };

  for (let i = period - 1; i < closes.length; i++) {
    const point = bollingerBandsAt(closes, i, period, stdDevMult);
    if (point) {
      setBandSeriesAt(upper, middle, lower, percentB, i, point);
    }
  }

  return { upper, middle, lower, percentB };
}

/**
 * Evaluates TTM Squeeze state at a specific candle index with optional precomputed EMA/ATR inputs.
 * Inputs: candles array, target index, optional bbPeriod, optional atrPeriod, optional precomputed context.
 * Outputs: boolean indicating squeeze is on (true) or off (false).
 * Side effects: none.
 * Failure modes: returns false if index is out of bounds or indicator data is unavailable.
 */
export function ttmSqueezeAt(
  candles: Candle[],
  idx: number,
  bbPeriod = DEFAULT_BB_PERIOD,
  atrPeriod = DEFAULT_ATR_PERIOD,
  precomputed?: TtmSqueezeContext,
): boolean {
  if (idx < 0 || idx >= candles.length) return false;
  const closes = candles.map((c) => c.close);
  const bb = bollingerBandsAt(closes, idx, bbPeriod, DEFAULT_BB_STD_DEV_MULT);
  if (!bb) return false;

  const emaVal = precomputed?.ema ?? emaSeries(closes, bbPeriod)[idx];
  const atrVal = precomputed?.atr ?? atrSeries(candles, atrPeriod)[idx];
  if (emaVal === null || atrVal === null || emaVal === undefined || atrVal === undefined) {
    return false;
  }

  const kcu = emaVal + KELTNER_ATR_MULT * atrVal;
  const kcl = emaVal - KELTNER_ATR_MULT * atrVal;
  return bb.upper <= kcu && bb.lower >= kcl;
}

/**
 * TTM Squeeze check: Bollinger Bands inside Keltner Channels across full candle history.
 * Inputs: candles array, optional bbPeriod (default 20), optional atrPeriod (default 14).
 * Outputs: boolean array aligned to candle history.
 * Side effects: none.
 * Failure modes: fills with false when indicators are null or insufficient data.
 */
export function ttmSqueezeSeries(
  candles: Candle[],
  bbPeriod = DEFAULT_BB_PERIOD,
  atrPeriod = DEFAULT_ATR_PERIOD,
): boolean[] {
  const closes = candles.map((c) => c.close);
  const bb = bollingerBandsSeries(closes, bbPeriod, DEFAULT_BB_STD_DEV_MULT);
  const atr = atrSeries(candles, atrPeriod);
  const ema = emaSeries(closes, bbPeriod);
  const squeeze: boolean[] = new Array(candles.length).fill(false);

  for (let i = 0; i < candles.length; i++) {
    const bbu = bb.upper[i];
    const bbl = bb.lower[i];
    const e = ema[i];
    const a = atr[i];

    if (bbu !== null && bbl !== null && e !== null && a !== null) {
      const kcu = e + KELTNER_ATR_MULT * a;
      const kcl = e - KELTNER_ATR_MULT * a;
      squeeze[i] = bbu <= kcu && bbl >= kcl;
    }
  }

  return squeeze;
}

export interface AdxResult {
  adx: (number | null)[];
  plusDi: (number | null)[];
  minusDi: (number | null)[];
}

/** Wilder's ADX / DMI calculation */
export function adxSeries(candles: Candle[], period = 14): AdxResult {
  const adx: (number | null)[] = new Array(candles.length).fill(null);
  const plusDi: (number | null)[] = new Array(candles.length).fill(null);
  const minusDi: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length < period * 2 + 1) return { adx, plusDi, minusDi };

  let trSmooth = 0;
  let plusDmSmooth = 0;
  let minusDmSmooth = 0;

  for (let i = 1; i <= period; i++) {
    const { high, low } = candles[i];
    const prev = candles[i - 1];
    trSmooth += Math.max(high - low, Math.abs(high - prev.close), Math.abs(low - prev.close));
    const upMove = high - prev.high;
    const downMove = prev.low - low;
    plusDmSmooth += upMove > downMove && upMove > 0 ? upMove : 0;
    minusDmSmooth += downMove > upMove && downMove > 0 ? downMove : 0;
  }

  const dxs: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = period + 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(high - low, Math.abs(high - prev.close), Math.abs(low - prev.close));
    const upMove = high - prev.high;
    const downMove = prev.low - low;
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

    trSmooth = trSmooth - trSmooth / period + tr;
    plusDmSmooth = plusDmSmooth - plusDmSmooth / period + plusDm;
    minusDmSmooth = minusDmSmooth - minusDmSmooth / period + minusDm;

    const pDi = trSmooth === 0 ? 0 : (plusDmSmooth / trSmooth) * 100;
    const mDi = trSmooth === 0 ? 0 : (minusDmSmooth / trSmooth) * 100;
    plusDi[i] = pDi;
    minusDi[i] = mDi;

    const sumDi = pDi + mDi;
    dxs[i] = sumDi === 0 ? 0 : (Math.abs(pDi - mDi) / sumDi) * 100;
  }

  const validDxs = dxs.slice(period + 1, period * 2 + 1).filter((v): v is number => v !== null);
  if (validDxs.length < period) return { adx, plusDi, minusDi };

  let adxVal = validDxs.reduce((sum, v) => sum + v, 0) / period;
  adx[period * 2] = adxVal;

  for (let i = period * 2 + 1; i < candles.length; i++) {
    const dx = dxs[i];
    if (dx !== null) {
      adxVal = (adxVal * (period - 1) + dx) / period;
      adx[i] = adxVal;
    }
  }

  return { adx, plusDi, minusDi };
}

export interface RsiDivergenceResult {
  bullishDivergence: boolean;
  bearishDivergence: boolean;
}

/** Detects price vs RSI divergence over a trailing window */
export function rsiDivergence(
  candles: Candle[],
  rsi: (number | null)[],
  endIdx: number = candles.length - 1,
  lookback = 20,
): RsiDivergenceResult {
  if (endIdx < lookback || endIdx >= candles.length) {
    return { bullishDivergence: false, bearishDivergence: false };
  }

  const currentCandle = candles[endIdx];
  const currentRsi = rsi[endIdx];
  if (currentRsi === null) return { bullishDivergence: false, bearishDivergence: false };

  const startIdx = Math.max(0, endIdx - lookback);
  let minPrice = Infinity;
  let minPriceRsi = Infinity;
  let maxPrice = -Infinity;
  let maxPriceRsi = -Infinity;

  for (let k = startIdx; k < endIdx - 2; k++) {
    const r = rsi[k];
    if (r === null) continue;
    if (candles[k].low < minPrice) {
      minPrice = candles[k].low;
      minPriceRsi = r;
    }
    if (candles[k].high > maxPrice) {
      maxPrice = candles[k].high;
      maxPriceRsi = r;
    }
  }

  const bullishDivergence = currentCandle.low <= minPrice && currentRsi > minPriceRsi + 2;
  const bearishDivergence = currentCandle.high >= maxPrice && currentRsi < maxPriceRsi - 2;

  return { bullishDivergence, bearishDivergence };
}



