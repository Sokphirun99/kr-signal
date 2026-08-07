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
export function scoreSetup(
  setup: Setup,
  options?: { ignoreVolume?: boolean },
): number {
  const { rsi, atrPct, regime, emaFast, emaSlow, rvol, distributionPullback } =
    setup.context;
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

    if (setup.context.squeeze >= 20 || setup.context.ttmSqueeze) {
      score += 10;
    }

    if (!options?.ignoreVolume) {
      if (rvol >= 1.2) score += 8;
      else if (rvol < 0.6) score -= 10;

      if (distributionPullback) score -= 8;
    }
  }

  // Volume & Bollinger percentB confirmation for range setups
  if (setup.style === "range") {
    if (!options?.ignoreVolume && rvol >= 1.5) score += 6;
    if (setup.context.percentB != null) {
      // Overextended range boundaries bonus
      if (setup.side === "buy" && setup.context.percentB <= 0.15) score += 6;
      else if (setup.side === "sell" && setup.context.percentB >= 0.85) score += 6;
    }
  }

  // Funding rate sentiment for crypto instruments
  const funding = setup.context.fundingRate;
  if (funding != null) {
    if (funding > 0.0005) {
      score += setup.side === "buy" ? -10 : 5;
    } else if (funding < -0.0005) {
      score += setup.side === "buy" ? 5 : -10;
    }
  }

  // ADX trend strength adjustments
  const adx = setup.context.adx;
  if (setup.style === "trend" && adx != null) {
    if (adx >= 22) score += 8;
    else if (adx < 20) score -= 10;
  }

  // RSI Divergence bonus
  if (setup.side === "buy" && setup.context.bullishDivergence) score += 8;
  else if (setup.side === "sell" && setup.context.bearishDivergence) score += 8;

  // Taker buy/sell volume aggression
  const takerRatio = setup.context.takerRatio;
  if (takerRatio != null) {
    if (setup.side === "buy") {
      if (takerRatio > 1.15) score += 6;
      else if (takerRatio < 0.85) score -= 6;
    } else if (setup.side === "sell") {
      if (takerRatio < 0.85) score += 6;
      else if (takerRatio > 1.15) score -= 6;
    }
  }

  // Macro sentiment (Fear & Greed Index)
  const fg = setup.context.fearAndGreed;
  if (fg != null) {
    if (setup.style === "range" && setup.side === "buy" && fg < 25) score += 5;
    if (setup.style === "trend" && setup.side === "buy" && fg > 75) score -= 5;
  }

  return Math.max(40, Math.min(90, score));
}

/**
 * Gates a candidate setup. Returns pass/fail with audit reasons.
 * `openSignalsExist` enforces one open signal per symbol+timeframe+side.
 */
export function gateSetup(
  setup: Setup,
  openSignalsExist: boolean,
  options?: { ignoreVolume?: boolean; ignoreOffHours?: boolean; symbol?: string | null },
): GateResult {
  const reasons: string[] = [];
  const confidence = scoreSetup(setup, options);
  const isGold = options?.symbol === "XAUUSD" || options?.symbol === "PAXGUSDT";
  const isForex = options?.symbol === "EURUSD" || options?.symbol === "GBPUSD" || options?.symbol === "EURUSDT" || options?.symbol === "GBPUSDT";

  if (openSignalsExist) reasons.push("cooldown: an open signal already exists for this market/direction");

  // Off-hours hard veto for 15m timeframe (Saturday/Sunday UTC or 21:00-00:00 UTC)
  if (!options?.ignoreOffHours) {
    const setupDate = new Date(setup.setupAt);
    const utcDay = setupDate.getUTCDay(); // 0 = Sun, 6 = Sat
    const utcHour = setupDate.getUTCHours();

    if (setup.timeframe === "15m") {
      if (utcDay === 0 || utcDay === 6 || utcHour >= 21) {
        reasons.push("off-hours");
      }
    }

    // Gold session gating: active London & NY sessions only (06:00 - 21:00 UTC), no weekends
    if (isGold) {
      if (utcDay === 0 || utcDay === 6 || utcHour < 6 || utcHour >= 21) {
        reasons.push("gold-off-session");
      }
    }

    // Forex session gating: active London & NY sessions (06:00 - 21:00 UTC), no weekends
    if (isForex) {
      if (utcDay === 0 || utcDay === 6 || utcHour < 6 || utcHour >= 21) {
        reasons.push("forex-off-session");
      }
    }
  }

  if (!options?.ignoreVolume && setup.style === "trend" && setup.context.rvol < 0.5) {
    reasons.push("thin-volume");
  }

  if (confidence < CONFIDENCE_FLOOR) reasons.push(`confidence ${confidence} below floor ${CONFIDENCE_FLOOR}`);

  const risk = Math.abs(setup.entry - setup.stopLoss);
  const reward1 = Math.abs(setup.tp1 - setup.entry);
  if (risk <= 0) reasons.push("invalid risk geometry");
  else if (reward1 / risk < 1.4) reasons.push("first target under 1.4R");

  const stopDistancePct = risk / setup.entry;
  const minStopPct = isGold ? 0.0015 : isForex ? 0.0003 : 0.0005;
  if (stopDistancePct < minStopPct) reasons.push(`stop too tight — noise would grade it randomly`);
  if (stopDistancePct > 0.08) reasons.push("stop wider than 8% — not a tradeable setup");

  return { pass: reasons.length === 0, confidence, reasons };
}

