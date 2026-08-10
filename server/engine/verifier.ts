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
import { TF_MS } from "@contracts/instruments";
import { atrSeries } from "./indicators";
import { getEngineConfig, type EngineConfig } from "../config/engineConfig";

export type SignalEventType =
  | "ENTRY_FILLED"
  | "TP1_HIT"
  | "STOP_MOVED_BE"
  | "TP2_HIT"
  | "TRAIL_UPDATED"
  | "TP3_HIT"
  | "CLOSED"
  | "EXPIRED"
  | "UNDECIDABLE";

export interface LifecycleEvent {
  eventKey: string;
  eventType: SignalEventType;
  price: number | null;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

export interface Verdict {
  status:
    "open" | "tp1" | "tp2" | "tp3" | "sl" | "be" | "expired" | "undecidable";
  entryFilled: boolean;
  exitPrice: number | null;
  rMultiple: number | null;
  closedAt: Date | null;
  events: LifecycleEvent[];
}

function touched(c: Candle, level: number): boolean {
  return c.low <= level && level <= c.high;
}

export function verifySignal(
  signal: Signal,
  candles: Candle[],
  engineConfig: EngineConfig = getEngineConfig()
): Verdict {
  const risk = Math.abs(signal.entry - signal.stopLoss);
  const isBuy = signal.side === "buy";
  const now = Date.now();
  const events: LifecycleEvent[] = [];

  const recordEvent = (
    eventType: SignalEventType,
    occurredAt: Date,
    price: number | null,
    metadata?: Record<string, unknown>
  ) => {
    const priceKey =
      price == null ? "none" : String(Math.round(price * 1e8) / 1e8);
    events.push({
      eventKey: `${signal.id}:${eventType}:${occurredAt.getTime()}:${priceKey}`,
      eventType,
      price,
      occurredAt,
      metadata,
    });
  };

  const base: Verdict = {
    status: "open",
    entryFilled: signal.entryFilled,
    exitPrice: null,
    rMultiple: null,
    closedAt: null,
    events,
  };

  const invalidGeometry =
    ![
      signal.entry,
      signal.stopLoss,
      signal.tp1,
      signal.tp2,
      signal.tp3,
      risk,
    ].every(Number.isFinite) ||
    risk <= 0 ||
    signal.entry <= 0 ||
    (isBuy
      ? !(
          signal.stopLoss < signal.entry &&
          signal.entry < signal.tp1 &&
          signal.tp1 < signal.tp2 &&
          signal.tp2 < signal.tp3
        )
      : !(
          signal.stopLoss > signal.entry &&
          signal.entry > signal.tp1 &&
          signal.tp1 > signal.tp2 &&
          signal.tp2 > signal.tp3
        ));
  if (invalidGeometry) {
    const closedAt = new Date(signal.setupAt);
    recordEvent("UNDECIDABLE", closedAt, null, {
      reason: "invalid signal risk geometry",
      entryFilled: false,
    });
    return { ...base, status: "undecidable", closedAt };
  }

  // Only candles after the setup candle matter
  const tape = candles.filter(c => c.openTime > signal.setupAt.getTime());
  if (tape.length === 0) {
    if (now > signal.expiresAt.getTime()) {
      const closedAt = new Date(signal.expiresAt);
      recordEvent("UNDECIDABLE", closedAt, null, {
        reason: "candle coverage did not reach expiry",
        entryFilled: signal.entryFilled,
      });
      return {
        ...base,
        status: "undecidable",
        entryFilled: signal.entryFilled,
        closedAt,
      };
    }
    return base;
  }

  // Pre-compute ATR series over candles
  const atrs = atrSeries(candles, 14);
  const candleIndexMap = new Map<number, number>();
  for (let k = 0; k < candles.length; k++) {
    candleIndexMap.set(candles[k].openTime, k);
  }

  // Reconstruct the complete lifecycle from tape on every pass. Starting from
  // the persisted boolean would let a later verification count a target that
  // traded before the entry was actually filled.
  let filled = false;
  let stop = signal.stopLoss;
  let tp1Hit = false;
  let tp2Hit = false;
  let highestCloseSinceTP2 = -Infinity;
  let lowestCloseSinceTP2 = Infinity;

  for (const c of tape) {
    // Expiry is a hard boundary. A candle must be fully closed by expiry;
    // otherwise its OHLC cannot prove whether a touch happened in time.
    if (c.openTime + TF_MS[signal.timeframe] > signal.expiresAt.getTime()) {
      const expiredAt = new Date(signal.expiresAt);
      recordEvent("EXPIRED", expiredAt, null, { entryFilled: filled });
      return {
        ...base,
        entryFilled: filled,
        status: "expired",
        closedAt: expiredAt,
      };
    }

    // 1. Entry fill: limit order fills if price reached or gapped past entry
    if (!filled) {
      const entryHit = isBuy ? c.low <= signal.entry : c.high >= signal.entry;
      if (!entryHit) continue;
      filled = true;
      recordEvent("ENTRY_FILLED", new Date(c.openTime), signal.entry, {
        timestampResolution: "candle",
      });
    }

    const closeIt = (status: Verdict["status"], exitPrice: number): Verdict => {
      // R is always computed from the realized exit: a stop filled exactly at
      // the stop lands at -1R, a break-even at entry lands at 0R, and a gap
      // through the level lands wherever the candle opened — slippage counts.
      const r = isBuy
        ? (exitPrice - signal.entry) / risk
        : (signal.entry - exitPrice) / risk;
      if (!Number.isFinite(exitPrice) || !Number.isFinite(r)) {
        const closedAt = new Date(signal.expiresAt);
        recordEvent("UNDECIDABLE", closedAt, null, {
          reason: "non-finite realized result",
          entryFilled: true,
        });
        return {
          ...base,
          entryFilled: true,
          status: "undecidable",
          closedAt,
        };
      }
      const closedAt = new Date(c.openTime);
      recordEvent("CLOSED", closedAt, exitPrice, {
        status,
        rMultiple: Math.round(r * 100) / 100,
        timestampResolution: "candle",
      });
      return {
        status,
        entryFilled: true,
        exitPrice,
        rMultiple: Math.round(r * 100) / 100,
        closedAt,
        events,
      };
    };

    // 2. Conservative same-candle rule: check stop BEFORE targets.
    //    Gap rule: if the candle OPENS beyond the stop, the realistic fill is
    //    the open price — the stop level itself never traded. After TP1 this
    //    can turn a break-even into a small loss; grade it honestly.
    if (isBuy ? c.low <= stop : c.high >= stop) {
      const gappedThrough = isBuy ? c.open < stop : c.open > stop;
      const exit = gappedThrough ? c.open : stop;
      const status: Verdict["status"] =
        tp2Hit && engineConfig.trailMode === "chandelier"
          ? "tp2"
          : tp1Hit
            ? (isBuy ? exit >= signal.entry : exit <= signal.entry)
              ? "be"
              : "sl"
            : "sl";
      return closeIt(status, exit);
    }

    // 3. Targets in order
    if (!tp1Hit && touched(c, signal.tp1)) {
      tp1Hit = true;
      stop = isBuy
        ? Math.max(stop, signal.entry)
        : Math.min(stop, signal.entry); // stop → break-even
      const occurredAt = new Date(c.openTime);
      recordEvent("TP1_HIT", occurredAt, signal.tp1, {
        timestampResolution: "candle",
      });
      recordEvent("STOP_MOVED_BE", occurredAt, stop, {
        timestampResolution: "candle",
      });
    }

    if (tp1Hit && !tp2Hit && touched(c, signal.tp2)) {
      tp2Hit = true;
      recordEvent("TP2_HIT", new Date(c.openTime), signal.tp2, {
        timestampResolution: "candle",
      });
      if (engineConfig.trailMode === "chandelier") {
        highestCloseSinceTP2 = c.close;
        lowestCloseSinceTP2 = c.close;
        const k = candleIndexMap.get(c.openTime) ?? -1;
        const atrVal =
          k >= 0 && atrs[k] !== null && atrs[k]! > 0 ? atrs[k]! : risk / 1.5;
        if (isBuy) {
          const trail = c.close - 2.5 * atrVal;
          const nextStop = Math.max(stop, trail);
          if (nextStop !== stop) {
            stop = nextStop;
            recordEvent("TRAIL_UPDATED", new Date(c.openTime), stop);
          }
        } else {
          const trail = c.close + 2.5 * atrVal;
          const nextStop = Math.min(stop, trail);
          if (nextStop !== stop) {
            stop = nextStop;
            recordEvent("TRAIL_UPDATED", new Date(c.openTime), stop);
          }
        }
      }
    }

    if (tp2Hit) {
      const tp3Hit = isBuy ? c.high >= signal.tp3 : c.low <= signal.tp3;
      if (tp3Hit) {
        const gappedThrough = isBuy ? c.open > signal.tp3 : c.open < signal.tp3;
        const exit = gappedThrough ? c.open : signal.tp3;
        recordEvent("TP3_HIT", new Date(c.openTime), signal.tp3, {
          timestampResolution: "candle",
        });
        return closeIt("tp3", exit);
      }

      if (engineConfig.trailMode === "chandelier") {
        highestCloseSinceTP2 = Math.max(highestCloseSinceTP2, c.close);
        lowestCloseSinceTP2 = Math.min(lowestCloseSinceTP2, c.close);
        const k = candleIndexMap.get(c.openTime) ?? -1;
        const atrVal =
          k >= 0 && atrs[k] !== null && atrs[k]! > 0 ? atrs[k]! : risk / 1.5;
        if (isBuy) {
          const trail = highestCloseSinceTP2 - 2.5 * atrVal;
          const nextStop = Math.max(stop, trail);
          if (nextStop !== stop) {
            stop = nextStop;
            recordEvent("TRAIL_UPDATED", new Date(c.openTime), stop);
          }
        } else {
          const trail = lowestCloseSinceTP2 + 2.5 * atrVal;
          const nextStop = Math.min(stop, trail);
          if (nextStop !== stop) {
            stop = nextStop;
            recordEvent("TRAIL_UPDATED", new Date(c.openTime), stop);
          }
        }
      }
    }
  }

  // Ran out of tape — signal is either still live or past expiry unverifiable
  if (now > signal.expiresAt.getTime()) {
    // If our candle coverage doesn't reach expiry, we cannot honestly grade
    const lastTapeTime = tape[tape.length - 1].openTime;
    if (lastTapeTime + TF_MS[signal.timeframe] < signal.expiresAt.getTime()) {
      const closedAt = new Date(signal.expiresAt);
      recordEvent("UNDECIDABLE", closedAt, null, { entryFilled: filled });
      return { ...base, entryFilled: filled, status: "undecidable", closedAt };
    }
    const expiredAt = new Date(signal.expiresAt);
    recordEvent("EXPIRED", expiredAt, null, { entryFilled: filled });
    return {
      ...base,
      entryFilled: filled,
      status: "expired",
      closedAt: expiredAt,
    };
  }

  return { ...base, entryFilled: filled };
}

/** Latest known price from the tape, for open-signal display */
export function lastPrice(candles: Candle[]): number | null {
  return candles.length ? candles[candles.length - 1].close : null;
}
