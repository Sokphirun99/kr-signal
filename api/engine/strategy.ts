/**
 * Setup generation: regime classification + trend/range strategies.
 *
 * Regime: EMA-20 vs EMA-50 separation relative to ATR decides trending vs
 * ranging. Trend setups enter on pullbacks toward EMA-20; range setups fade
 * swing extremes. Stops are ATR-based, targets are fixed R multiples.
 */

import type { Candle } from "./binance";
import { emaSeries, atrSeries, rsiSeries, swingLevels, atrPercentile } from "./indicators";
import type { StrategyStyle, TradeSide } from "@contracts/instruments";

export interface Setup {
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
  };
}

const TP_R = [1.5, 2.5, 4.0] as const;

function roundTo(x: number, sig = 1e-8): number {
  // Guard against floating point noise crossing level comparisons
  return Math.round(x / sig) * sig;
}

export function generateSetup(candles: Candle[]): Setup | null {
  if (candles.length < 120) return null;

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

  const base = {
    setupAt: candle.openTime,
    context: { atr: a, rsi: r, emaFast: f, emaSlow: s, atrPct, regime },
  };

  if (regime === "trending") {
    const uptrend = f > s && candle.close > f;
    const downtrend = f < s && candle.close < f;

    // Entry: pullback zone around EMA-20 (limit-style entry, not market)
    if (uptrend && r >= 45 && r <= 70) {
      const entry = roundTo(f + 0.25 * a);
      const stopLoss = roundTo(entry - 1.5 * a);
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
    if (downtrend && r >= 30 && r <= 55) {
      const entry = roundTo(f - 0.25 * a);
      const stopLoss = roundTo(entry + 1.5 * a);
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

  const nearLow = candle.close <= swingLow + 0.25 * box;
  const nearHigh = candle.close >= swingHigh - 0.25 * box;

  if (nearLow && r < 42) {
    const entry = roundTo(swingLow + 0.15 * box);
    const stopLoss = roundTo(swingLow - 0.75 * a);
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
    const stopLoss = roundTo(swingHigh + 0.75 * a);
    const risk = stopLoss - entry;
    if (risk <= 0) return null;
    const tp1 = roundTo(entry - TP_R[0] * risk);
    const tp2 = roundTo(entry - TP_R[1] * risk);
    const tp3 = roundTo(Math.min(tp2, Math.max(entry - TP_R[2] * risk, swingLow + 0.1 * box)));
    return { ...base, style: "range", side: "sell", entry, stopLoss, tp1, tp2, tp3 };
  }
  return null;
}
