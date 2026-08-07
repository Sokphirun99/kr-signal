/**
 * Setup generation: regime classification + trend/range strategies.
 *
 * Regime: EMA-20 vs EMA-50 separation relative to ATR decides trending vs
 * ranging. Trend setups enter on pullbacks toward EMA-20; range setups fade
 * swing extremes. Stops are ATR-based, targets are fixed R multiples.
 */

import type { Candle } from "./binance";
import {
  emaSeries,
  atrSeries,
  rsiSeries,
  swingLevels,
  atrPercentile,
  squeezeLength,
  vwapAt,
  bollingerBandsAt,
  ttmSqueezeAt,
  adxSeries,
  rsiDivergence,
} from "./indicators";
import type { StrategyStyle, TradeSide, Timeframe } from "@contracts/instruments";

export let SQUEEZE_BREAKOUT = false;

export function setSqueezeBreakout(enabled: boolean): void {
  SQUEEZE_BREAKOUT = enabled;
}

export interface Setup {
  timeframe: Timeframe;
  style: StrategyStyle;
  side: TradeSide;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  /** Candle open time that produced this setup */
  setupAt: number;
  /** Inputs the gate uses for confidence scoring */
  context: {
    atr: number;
    rsi: number;
    emaFast: number;
    emaSlow: number;
    atrPct: number;
    regime: "trending" | "ranging";
    rvol: number;
    squeeze: number;
    distributionPullback?: boolean;
    fundingRate?: number | null;
    vwap?: number | null;
    percentB?: number | null;
    ttmSqueeze?: boolean;
    openInterest?: number | null;
    adx?: number | null;
    plusDi?: number | null;
    minusDi?: number | null;
    bullishDivergence?: boolean;
    bearishDivergence?: boolean;
    takerRatio?: number | null;
    fearAndGreed?: number | null;
  };
}

const TP_R = [1.5, 2.5, 4.0] as const;

function roundTo(x: number, sig = 1e-8): number {
  // Guard against floating point noise crossing level comparisons
  return Math.round(x / sig) * sig;
}

export function generateSetup(
  candles: Candle[],
  timeframe: Timeframe,
  fundingRate?: number | null,
  openInterest?: number | null,
  takerRatio?: number | null,
  fearAndGreed?: number | null,
  symbol?: string | null,
): Setup | null {
  if (candles.length < 120) return null;

  const isGold = symbol === "XAUUSD" || symbol === "PAXGUSDT";
  const isForex = symbol === "EURUSD" || symbol === "GBPUSD" || symbol === "EURUSDT" || symbol === "GBPUSDT";
  const atrStopMult = isGold ? 2.2 : isForex ? 1.8 : 1.5;
  const rangeStopMult = isGold ? 1.25 : isForex ? 1.0 : 0.75;

  const closes = candles.map((c) => c.close);
  const emaFast = emaSeries(closes, 20);
  const emaSlow = emaSeries(closes, 50);
  const atr = atrSeries(candles, 14);
  const rsi = rsiSeries(closes, 14);

  const i = candles.length - 1; // last closed candle
  const f = emaFast[i];
  const s = emaSlow[i];
  const a = atr[i];
  const r = rsi[i];
  if (f === null || s === null || a === null || r === null || a <= 0) return null;

  const candle = candles[i];
  const separation = Math.abs(f - s) / a;
  const regime: "trending" | "ranging" = separation >= 0.8 ? "trending" : "ranging";
  const atrPct = atrPercentile(atr);
  const squeeze = squeezeLength(atr, i, 20);

  // Volume calculations: rvol (last closed candle volume / mean volume of last 20)
  const volumes = candles.map((c) => c.volume);
  const last20Vol = volumes.slice(Math.max(0, i - 19), i + 1);
  const mean20Vol =
    last20Vol.length > 0 ? last20Vol.reduce((sum, v) => sum + v, 0) / last20Vol.length : 0;
  const rvol = mean20Vol > 0 ? candle.volume / mean20Vol : 1.0;

  // Pullback health for trend setups
  let distributionPullback = false;
  const prior7Vol = volumes.slice(Math.max(0, i - 9), Math.max(0, i - 2));
  const meanPrior7Vol =
    prior7Vol.length > 0 ? prior7Vol.reduce((sum, v) => sum + v, 0) / prior7Vol.length : 0;

  if (regime === "trending") {
    const uptrend = f > s && candle.close > f;
    const downtrend = f < s && candle.close < f;

    if (uptrend) {
      const recent = candles.slice(Math.max(0, i - 15), i + 1);
      const downCandles = recent.filter((c) => c.close < c.open);
      if (downCandles.length >= 3) {
        const last3 = downCandles.slice(-3);
        const meanDown3 = last3.reduce((sum, c) => sum + c.volume, 0) / 3;
        if (meanPrior7Vol > 0 && meanDown3 > meanPrior7Vol) {
          distributionPullback = true;
        }
      }
    }

    if (downtrend) {
      const recent = candles.slice(Math.max(0, i - 15), i + 1);
      const upCandles = recent.filter((c) => c.close > c.open);
      if (upCandles.length >= 3) {
        const last3 = upCandles.slice(-3);
        const meanUp3 = last3.reduce((sum, c) => sum + c.volume, 0) / 3;
        if (meanPrior7Vol > 0 && meanUp3 > meanPrior7Vol) {
          distributionPullback = true;
        }
      }
    }
  }

  const currentVwap = vwapAt(candles, i);
  const bbPoint = bollingerBandsAt(closes, i, 20, 2.0);
  const currentTtmSqueeze = ttmSqueezeAt(candles, i, 20, 14, { ema: f, atr: a });
  const { adx, plusDi, minusDi } = adxSeries(candles, 14);
  const { bullishDivergence, bearishDivergence } = rsiDivergence(candles, rsi, i, 20);

  const currentPercentB = bbPoint?.percentB ?? null;
  const currentAdx = adx[i];
  const currentPlusDi = plusDi[i];
  const currentMinusDi = minusDi[i];

  const base = {
    timeframe,
    setupAt: candle.openTime,
    context: {
      atr: a,
      rsi: r,
      emaFast: f,
      emaSlow: s,
      atrPct,
      regime,
      rvol,
      squeeze,
      distributionPullback,
      fundingRate: fundingRate ?? null,
      vwap: currentVwap,
      percentB: currentPercentB,
      ttmSqueeze: currentTtmSqueeze,
      openInterest: openInterest ?? null,
      adx: currentAdx,
      plusDi: currentPlusDi,
      minusDi: currentMinusDi,
      bullishDivergence,
      bearishDivergence,
      takerRatio: takerRatio ?? null,
      fearAndGreed: fearAndGreed ?? null,
    },
  };

  if (regime === "trending") {
    const uptrend = f > s && candle.close > f;
    const downtrend = f < s && candle.close < f;

    const rsiMinUp = SQUEEZE_BREAKOUT && squeeze >= 20 ? 40 : 45;
    const rsiMaxUp = SQUEEZE_BREAKOUT && squeeze >= 20 ? 75 : 70;
    const rsiMinDown = SQUEEZE_BREAKOUT && squeeze >= 20 ? 25 : 30;
    const rsiMaxDown = SQUEEZE_BREAKOUT && squeeze >= 20 ? 60 : 55;

    // Entry: pullback zone around EMA-20 (limit-style entry, not market)
    if (uptrend && r >= rsiMinUp && r <= rsiMaxUp) {
      const entry = roundTo(f + 0.25 * a);
      const stopLoss = roundTo(entry - atrStopMult * a);
      const risk = entry - stopLoss;
      if (entry < candle.low - 2 * a) return null; // entry absurdly far below price
      return {
        ...base,
        style: "trend",
        side: "buy",
        entry,
        stopLoss,
        tp1: roundTo(entry + TP_R[0] * risk),
        tp2: roundTo(entry + TP_R[1] * risk),
        tp3: roundTo(entry + TP_R[2] * risk),
      };
    }
    if (downtrend && r >= rsiMinDown && r <= rsiMaxDown) {

      const entry = roundTo(f - 0.25 * a);
      const stopLoss = roundTo(entry + atrStopMult * a);
      const risk = stopLoss - entry;
      if (entry > candle.high + 2 * a) return null;
      return {
        ...base,
        style: "trend",
        side: "sell",
        entry,
        stopLoss,
        tp1: roundTo(entry - TP_R[0] * risk),
        tp2: roundTo(entry - TP_R[1] * risk),
        tp3: roundTo(entry - TP_R[2] * risk),
      };
    }
    return null;
  }

  // Ranging: fade the extremes of the recent swing box
  const { swingHigh, swingLow } = swingLevels(candles, i, 24);
  const box = swingHigh - swingLow;
  if (box < 2.5 * a) return null; // box too tight to fade safely

  if (RANGE_MODE === "touch") {
    const nearLow = candle.close <= swingLow + 0.25 * box;
    const nearHigh = candle.close >= swingHigh - 0.25 * box;

    if (nearLow && r < 42) {
      const entry = roundTo(swingLow + 0.15 * box);
      const stopLoss = roundTo(swingLow - rangeStopMult * a);
      const risk = entry - stopLoss;
      if (risk <= 0) return null;
      const tp1 = roundTo(entry + TP_R[0] * risk);
      const tp2 = roundTo(entry + TP_R[1] * risk);
      // Cap TP3 at the box top, but never below TP2 — targets must stay ordered
      const tp3 = roundTo(Math.max(tp2, Math.min(entry + TP_R[2] * risk, swingHigh - 0.1 * box)));
      return { ...base, style: "range", side: "buy", entry, stopLoss, tp1, tp2, tp3 };
    }
    if (nearHigh && r > 58) {
      const entry = roundTo(swingHigh - 0.15 * box);
      const stopLoss = roundTo(swingHigh + rangeStopMult * a);
      const risk = stopLoss - entry;
      if (risk <= 0) return null;
      const tp1 = roundTo(entry - TP_R[0] * risk);
      const tp2 = roundTo(entry - TP_R[1] * risk);
      const tp3 = roundTo(Math.min(tp2, Math.max(entry - TP_R[2] * risk, swingLow + 0.1 * box)));
      return { ...base, style: "range", side: "sell", entry, stopLoss, tp1, tp2, tp3 };
    }
    return null;
  }

  // Sweep + reclaim range mode (default)
  const recent3 = candles.slice(Math.max(0, i - 3), i + 1);
  const sweptLow = recent3.some((c) => c.low < swingLow && c.close > swingLow);
  const sweptHigh = recent3.some((c) => c.high > swingHigh && c.close < swingHigh);

  if (sweptLow && candle.close > swingLow && r < 45) {
    const entry = roundTo(swingLow + 0.15 * box);
    const stopLoss = roundTo(swingLow - rangeStopMult * a);
    const risk = entry - stopLoss;
    if (risk <= 0) return null;
    const tp1 = roundTo(entry + TP_R[0] * risk);
    const tp2 = roundTo(entry + TP_R[1] * risk);
    const tp3 = roundTo(Math.max(tp2, Math.min(entry + TP_R[2] * risk, swingHigh - 0.1 * box)));
    return { ...base, style: "range", side: "buy", entry, stopLoss, tp1, tp2, tp3 };
  }
  if (sweptHigh && candle.close < swingHigh && r > 55) {
    const entry = roundTo(swingHigh - 0.15 * box);
    const stopLoss = roundTo(swingHigh + rangeStopMult * a);
    const risk = stopLoss - entry;
    if (risk <= 0) return null;
    const tp1 = roundTo(entry - TP_R[0] * risk);
    const tp2 = roundTo(entry - TP_R[1] * risk);
    const tp3 = roundTo(Math.min(tp2, Math.max(entry - TP_R[2] * risk, swingLow + 0.1 * box)));
    return { ...base, style: "range", side: "sell", entry, stopLoss, tp1, tp2, tp3 };
  }

  return null;
}

export let RANGE_MODE: "sweep" | "touch" = "sweep";

export function setRangeMode(mode: "sweep" | "touch"): void {
  RANGE_MODE = mode;
}

export const HTF_MAP: Record<Timeframe, Timeframe | null> = {

  "15m": "1h",
  "1h": "4h",
  "4h": null,
};

export function getHtfRegime(htfCandles: Candle[]): {
  regime: "trending" | "ranging";
  direction: TradeSide | null;
} {
  if (htfCandles.length < 120) {
    return { regime: "ranging", direction: null };
  }
  const closes = htfCandles.map((c) => c.close);
  const emaFast = emaSeries(closes, 20);
  const emaSlow = emaSeries(closes, 50);
  const atr = atrSeries(htfCandles, 14);

  const i = htfCandles.length - 1;
  const f = emaFast[i];
  const s = emaSlow[i];
  const a = atr[i];

  if (f === null || s === null || a === null || a <= 0) {
    return { regime: "ranging", direction: null };
  }

  const separation = Math.abs(f - s) / a;
  if (separation < 0.8) {
    return { regime: "ranging", direction: null };
  }

  return {
    regime: "trending",
    direction: f > s ? "buy" : "sell",
  };
}

export function isHtfVetoed(
  timeframe: Timeframe,
  side: TradeSide,
  htfCandles?: Candle[],
): boolean {
  if (timeframe === "4h" || !htfCandles || htfCandles.length < 120) return false;
  const htf = getHtfRegime(htfCandles);
  if (htf.regime !== "trending" || !htf.direction) return false;

  if (side === "buy" && htf.direction === "sell") return true;
  if (side === "sell" && htf.direction === "buy") return true;

  return false;
}

