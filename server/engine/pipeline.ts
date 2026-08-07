/**
 * Pipeline orchestrator.
 *
 * No cron daemon exists in this deployment model, so the pipeline runs
 * "scan-on-read": routers call ensureFresh(), which throttles to one pass
 * per SCAN_INTERVAL and then (1) verifies open signals against fresh tape,
 * (2) scans every instrument × timeframe for new setups.
 */

import { getDb } from "../queries/connection";
import { signals, scanRuns, type InsertSignal } from "@db/schema";
import { and, eq, desc } from "drizzle-orm";
import {
  INSTRUMENTS,
  TIMEFRAMES,
  EXPIRY_MS,
  type Timeframe,
} from "@contracts/instruments";
import { fetchClosedKlines, fetchActiveKlines } from "./binance";
import { generateSetup, HTF_MAP, isHtfVetoed } from "./strategy";
import { gateSetup } from "./gate";
import { verifySignal } from "./verifier";
import {
  fetchFundingRate,
  fetchOpenInterest,
  fetchTakerRatio,
  fetchFearAndGreed,
} from "./futures";

const SCAN_INTERVAL_MS = 5 * 60_000; // one pipeline pass per 5 minutes max
let lastPass = 0;
let running = false;

export interface PassReport {
  scannedAt?: Date;
  verified: number;
  closed: number;
  candidates: number;
  published: number;
  errors: string[];
}

export type PipelineReport = PassReport & { scannedAt: Date };

export async function ensureFresh(): Promise<void> {
  if (running || Date.now() - lastPass < SCAN_INTERVAL_MS) return;
  try {
    const latestRun = await getDb()
      .select({ ranAt: scanRuns.ranAt })
      .from(scanRuns)
      .orderBy(desc(scanRuns.ranAt))
      .limit(1);
    if (latestRun.length > 0 && latestRun[0].ranAt) {
      const dbLastPass = latestRun[0].ranAt.getTime();
      if (Date.now() - dbLastPass < SCAN_INTERVAL_MS) {
        lastPass = dbLastPass;
        return;
      }
    }
  } catch (err) {
    console.error("[ensureFresh DB Throttle Check Error]:", err);
  }
  return forceRunPipelinePass().then(() => undefined);
}

export async function forceRunPipelinePass(): Promise<PipelineReport> {
  if (running) {
    return { 
      scannedAt: new Date(),
      verified: 0, 
      closed: 0, 
      candidates: 0, 
      published: 0, 
      errors: ["Pipeline pass already running"] 
    };
  }
  running = true;
  try {
    const report = await runPipeline();
    lastPass = Date.now();
    return report;
  } finally {
    running = false;
  }
}

export async function runPipeline(): Promise<PipelineReport> {
  const report: PipelineReport = {
    scannedAt: new Date(),
    verified: 0,
    closed: 0,
    candidates: 0,
    published: 0,
    errors: [],
  };

  // ---- Stage 1: verify open signals against fresh real-time tape -------------
  const openSignals = await getDb()
    .select()
    .from(signals)
    .where(eq(signals.status, "open"));

  const activeCandlesByPairTf = new Map<string, Awaited<ReturnType<typeof fetchActiveKlines>>>();
  const closedCandlesByPairTf = new Map<string, Awaited<ReturnType<typeof fetchClosedKlines>>>();

  async function activeKlinesFor(pair: string, tf: Timeframe) {
    const key = `${pair}:${tf}`;
    if (!activeCandlesByPairTf.has(key)) {
      activeCandlesByPairTf.set(key, await fetchActiveKlines(pair, tf, 300));
    }
    return activeCandlesByPairTf.get(key)!;
  }

  async function klinesFor(pair: string, tf: Timeframe) {
    const key = `${pair}:${tf}`;
    if (!closedCandlesByPairTf.has(key)) {
      closedCandlesByPairTf.set(key, await fetchClosedKlines(pair, tf, 300));
    }
    return closedCandlesByPairTf.get(key)!;
  }

  for (const sig of openSignals) {
    const instrument = INSTRUMENTS.find((i) => i.symbol === sig.symbol);
    if (!instrument) continue;
    try {
      const candles = await activeKlinesFor(instrument.pair, sig.timeframe);
      const verdict = verifySignal(sig, candles);
      report.verified++;
      if (verdict.status !== "open" || verdict.entryFilled !== sig.entryFilled) {
        await getDb()
          .update(signals)
          .set({
            status: verdict.status,
            entryFilled: verdict.entryFilled,
            exitPrice: verdict.exitPrice,
            rMultiple: verdict.rMultiple,
            closedAt: verdict.closedAt,
          })
          .where(eq(signals.id, sig.id));
        if (verdict.status !== "open") report.closed++;
      }
    } catch (err) {
      report.errors.push(`verify ${sig.symbol} ${sig.timeframe}: ${String(err)}`);
    }
  }

  // ---- Stage 2: scan for new setups ---------------------------------------
  await Promise.all(
    INSTRUMENTS.map(async (instrument) => {
      let fundingRate: number | null = null;
      let openInterest: number | null = null;
      let takerRatio: number | null = null;
      let fearAndGreed: number | null = null;

      if (instrument.market === "crypto") {
        try {
          const [fr, oi, tr, fg] = await Promise.all([
            fetchFundingRate(instrument.symbol),
            fetchOpenInterest(instrument.symbol),
            fetchTakerRatio(instrument.symbol),
            fetchFearAndGreed(),
          ]);
          fundingRate = fr;
          openInterest = oi;
          takerRatio = tr;
          fearAndGreed = fg;
        } catch {
          fundingRate = null;
          openInterest = null;
          takerRatio = null;
          fearAndGreed = null;
        }
      }

      for (const timeframe of TIMEFRAMES) {
        let candidates = 0;
        let published = 0;
        let note: string | null = null;
        try {
          const candles = await klinesFor(instrument.pair, timeframe);
          const setup = generateSetup(
            candles,
            timeframe,
            fundingRate,
            openInterest,
            takerRatio,
            fearAndGreed,
            instrument.symbol,
          );

          if (!setup) {
            note = "no setup";
          } else {
            candidates = 1;
            report.candidates++;

            const fundingActive = fundingRate != null && Math.abs(fundingRate) > 0.0005;
            const fundingNote = fundingActive
              ? `funding: ${fundingRate! > 0 ? "+" : ""}${fundingRate!.toFixed(6)}`
              : null;

            const htfTf = HTF_MAP[timeframe];
            const htfCandles = htfTf ? await klinesFor(instrument.pair, htfTf) : undefined;
            const vetoed = isHtfVetoed(timeframe, setup.side, htfCandles);

            if (vetoed) {
              note = fundingNote ? `htf-veto; ${fundingNote}` : "htf-veto";
            } else {
              const existing = await getDb()
                .select({ id: signals.id })
                .from(signals)
                .where(
                  and(
                    eq(signals.symbol, instrument.symbol),
                    eq(signals.timeframe, timeframe),
                    eq(signals.side, setup.side),
                    eq(signals.status, "open"),
                  ),
                )
                .limit(1);

              const gate = gateSetup(setup, existing.length > 0, { symbol: instrument.symbol });
              if (!gate.pass) {
                const reasonText = gate.reasons.join("; ");
                note = fundingNote ? `${reasonText}; ${fundingNote}` : reasonText;
              } else {
                if (fundingNote) note = fundingNote;

                const row: InsertSignal = {
                  symbol: instrument.symbol,
                  market: instrument.market,
                  timeframe,
                  style: setup.style,
                  side: setup.side,
                  entry: setup.entry,
                  stopLoss: setup.stopLoss,
                  tp1: setup.tp1,
                  tp2: setup.tp2,
                  tp3: setup.tp3,
                  confidence: gate.confidence,
                  engine: "rules",
                  setupAt: new Date(setup.setupAt),
                  expiresAt: new Date(Date.now() + EXPIRY_MS[timeframe]),
                };
                try {
                  await getDb().insert(signals).values(row);
                  published = 1;
                  report.published++;
                } catch {
                  // Duplicate setup candle — already in the ledger
                  note = "duplicate setup (already recorded)";
                }
              }
            }
          }
        } catch (err) {
          note = `error: ${String(err)}`;
          report.errors.push(`scan ${instrument.symbol} ${timeframe}: ${String(err)}`);
        }
        try {
          await getDb().insert(scanRuns).values({
            symbol: instrument.symbol,
            timeframe,
            candidates,
            published,
            note,
          });
        } catch {
          // Funnel bookkeeping must never break the pipeline
        }
      }
    }),
  );

  return report;
}
