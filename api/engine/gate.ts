/**
 * The Desk — publication gate.
 *
 * Every candidate the strategy produces goes through these gates before it
 * may be inserted into the ledger. Publishing is deliberately rare: a feed
 * that publishes everything is worth nothing.
 */

import type { Setup } from "./strategy";

export interface GateResult {
  pass: boolean;
  confidence: number;
  reasons: string[];
}

/** Minimum confluence score required to publish */
export const CONFIDENCE_FLOOR = 60;

/**
 * Heuristic confidence 40–90 from confluence factors.
 * (When the AI council ships, its score replaces this while the schema's
 * `engine` column records which one produced the signal.)
 */
export function scoreSetup(setup: Setup): number {
  const { rsi, atrPct, regime, emaFast, emaSlow } = setup.context;
  let score = 50;

  // Regime alignment: trend setup in trending regime (and vice versa)
  const aligned =
    (setup.style === "trend" && regime === "trending") ||
    (setup.style === "range" && regime === "ranging");
  score += aligned ? 12 : -15;

  // Momentum not exhausted: RSI in the healthy half for the direction
  if (setup.side === "buy") score += rsi >= 45 && rsi <= 65 ? 10 : rsi < 45 ? 2 : -6;
  else score += rsi >= 35 && rsi <= 55 ? 10 : rsi > 55 ? 2 : -6;

  // Volatility sweet spot: avoid dead and chaotic tapes
  if (atrPct >= 0.25 && atrPct <= 0.8) score += 10;
  else if (atrPct < 0.15) score -= 12; // no movement, nothing to grade
  else if (atrPct > 0.9) score -= 8; // too wild, stop placement unreliable

  // Trend strength for trend setups
  if (setup.style === "trend") {
    const sep = Math.abs(emaFast - emaSlow) / setup.context.atr;
    score += Math.min(8, Math.round(sep * 4));
  }

  return Math.max(40, Math.min(90, score));
}

/**
 * Gates a candidate setup. Returns pass/fail with audit reasons.
 * `openSignalsExist` enforces one open signal per symbol+timeframe+side.
 */
export function gateSetup(setup: Setup, openSignalsExist: boolean): GateResult {
  const reasons: string[] = [];
  const confidence = scoreSetup(setup);

  if (openSignalsExist) reasons.push("cooldown: an open signal already exists for this market/direction");
  if (confidence < CONFIDENCE_FLOOR) reasons.push(`confidence ${confidence} below floor ${CONFIDENCE_FLOOR}`);

  const risk = Math.abs(setup.entry - setup.stopLoss);
  const reward1 = Math.abs(setup.tp1 - setup.entry);
  if (risk <= 0) reasons.push("invalid risk geometry");
  else if (reward1 / risk < 1.4) reasons.push("first target under 1.4R");

  const stopDistancePct = risk / setup.entry;
  if (stopDistancePct < 0.0005) reasons.push("stop too tight — noise would grade it randomly");
  if (stopDistancePct > 0.08) reasons.push("stop wider than 8% — not a tradeable setup");

  return { pass: reasons.length === 0, confidence, reasons };
}
