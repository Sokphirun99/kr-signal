/**
 * Tape verifier — walks each open signal through the actual candle history
 * and grades what the market did: entry fill, TP1/2/3, SL, break-even,
 * expiry, or undecidable.
 *
 * Rules:
 * - Entry must be touched before any exit counts (no fill → expires ungraded).
 * - If SL and a TP both fall inside one candle, the conservative reading
 *   (SL first) is taken — the tape can't tell us the intra-candle order.
 * - After TP1 is hit, the stop moves to break-even.
 * - Expired signals are reported but never enter the win-rate denominator.
 */

import type { Candle } from "./binance";
import type { Signal } from "@db/schema";

export interface Verdict {
  status: "open" | "tp1" | "tp2" | "tp3" | "sl" | "be" | "expired" | "undecidable";
  entryFilled: boolean;
  exitPrice: number | null;
  rMultiple: number | null;
  closedAt: Date | null;
}

function touched(c: Candle, level: number): boolean {
  return c.low <= level && level <= c.high;
}

export function verifySignal(signal: Signal, candles: Candle[]): Verdict {
  const risk = Math.abs(signal.entry - signal.stopLoss);
  const isBuy = signal.side === "buy";
  const now = Date.now();

  const base: Verdict = {
    status: "open",
    entryFilled: signal.entryFilled,
    exitPrice: null,
    rMultiple: null,
    closedAt: null,
  };

  // Only candles after the setup candle matter
  const tape = candles.filter((c) => c.openTime > signal.setupAt.getTime());
  if (tape.length === 0) {
    return now > signal.expiresAt.getTime()
      ? { ...base, status: "expired", closedAt: new Date(signal.expiresAt) }
      : base;
  }

  let filled = signal.entryFilled;
  let stop = signal.stopLoss;
  let tp1Hit = false;
  let tp2Hit = false;

  for (const c of tape) {
    // 1. Entry fill
    if (!filled) {
      if (c.openTime > signal.expiresAt.getTime()) {
        return { ...base, status: "expired", closedAt: new Date(signal.expiresAt) };
      }
      if (!touched(c, signal.entry)) continue;
      filled = true;
    }

    const closeIt = (
      status: Verdict["status"],
      exitPrice: number,
    ): Verdict => {
      // R is always computed from the realized exit: a stop filled exactly at
      // the stop lands at -1R, a break-even at entry lands at 0R, and a gap
      // through the level lands wherever the candle opened — slippage counts.
      const r = isBuy
        ? (exitPrice - signal.entry) / risk
        : (signal.entry - exitPrice) / risk;
      return {
        status,
        entryFilled: true,
        exitPrice,
        rMultiple: Math.round(r * 100) / 100,
        closedAt: new Date(c.openTime),
      };
    };

    // 2. Conservative same-candle rule: check stop before targets.
    //    Gap rule: if the candle OPENS beyond the stop, the realistic fill is
    //    the open price — the stop level itself never traded. After TP1 this
    //    can turn a break-even into a small loss; grade it honestly.
    if (isBuy ? c.low <= stop : c.high >= stop) {
      const gappedThrough = isBuy ? c.open < stop : c.open > stop;
      const exit = gappedThrough ? c.open : stop;
      const status: Verdict["status"] = tp1Hit
        ? (isBuy ? exit >= signal.entry : exit <= signal.entry)
          ? "be"
          : "sl"
        : "sl";
      return closeIt(status, exit);
    }

    // 3. Targets in order
    if (!tp1Hit && touched(c, signal.tp1)) {
      tp1Hit = true;
      stop = signal.entry; // stop → break-even
    }
    if (tp1Hit && !tp2Hit && touched(c, signal.tp2)) tp2Hit = true;
    if (tp2Hit && touched(c, signal.tp3)) {
      return closeIt("tp3", signal.tp3);
    }

    // 4. Post-entry expiry: if the signal never reaches any level in time,
    //    it expires ungraded even though it filled.
    if (c.openTime > signal.expiresAt.getTime()) {
      return {
        ...base,
        entryFilled: true,
        status: "expired",
        closedAt: new Date(signal.expiresAt),
      };
    }
  }

  // Ran out of tape — signal is either still live or past expiry unverifiable
  if (now > signal.expiresAt.getTime()) {
    // If our candle coverage doesn't reach expiry, we cannot honestly grade
    const lastTapeTime = tape[tape.length - 1].openTime;
    if (lastTapeTime < signal.expiresAt.getTime() - 86_400_000) {
      return { ...base, entryFilled: filled, status: "undecidable", closedAt: new Date() };
    }
    return { ...base, entryFilled: filled, status: "expired", closedAt: new Date(signal.expiresAt) };
  }

  return { ...base, entryFilled: filled };
}

/** Latest known price from the tape, for open-signal display */
export function lastPrice(candles: Candle[]): number | null {
  return candles.length ? candles[candles.length - 1].close : null;
}
