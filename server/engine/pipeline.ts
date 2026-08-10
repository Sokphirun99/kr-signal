/**
 * Pipeline orchestrator.
 *
 * No cron daemon exists in this deployment model, so the pipeline runs
 * "scan-on-read": routers call ensureFresh(), which throttles to one pass
 * per SCAN_INTERVAL and then (1) verifies open signals against fresh tape,
 * (2) scans every instrument × timeframe for new setups.
 *
 * Timeframes within each instrument are parallelized via Promise.all.
 * Kline caches store Promises (not resolved values) to avoid duplicate
 * in-flight fetches under concurrency.
 */

import { getDb } from "../queries/connection";
import { signals, scanRuns, signalEvents, type InsertSignal } from "@db/schema";
import { and, eq, desc } from "drizzle-orm";
import {
  INSTRUMENTS,
  TIMEFRAMES,
  EXPIRY_MS,
  type Timeframe,
} from "@contracts/instruments";
import { type Candle, fetchClosedKlines } from "./binance";
import { generateSetup, HTF_MAP, isHtfVetoed } from "./strategy";
import { gateSetup } from "./gate";
import { verifySignal } from "./verifier";
import {
  fetchFundingRate,
  fetchOpenInterest,
  fetchTakerRatio,
  fetchFearAndGreed,
} from "./futures";
import { getNews } from "./news";
import { upsertNewsBatch, pruneNewsOlderThan7Days } from "../queries/news";
import { pruneScanRunsOlderThan14Days } from "../queries/signals";
import { randomUUID } from "node:crypto";
import {
  releasePipelineLease,
  tryAcquirePipelineLease,
} from "../queries/pipelineLease";
import { isUniqueViolation } from "../lib/postgresError";
import { getEngineConfigSnapshot } from "../config/engineConfig";

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
  timings: {
    totalMs: number;
    verificationMs: number;
    scanMs: number;
    maintenanceMs: number;
  };
}

export type PipelineReport = PassReport & { scannedAt: Date };

/**
 * Bookkeeping row collected during the scan stage.
 * Batched into a single DB insert at the end of the pass.
 */
interface ScanRunRow {
  symbol: string;
  timeframe: Timeframe;
  candidates: number;
  published: number;
  note: string | null;
}

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
      errors: ["Pipeline pass already running"],
      timings: { totalMs: 0, verificationMs: 0, scanMs: 0, maintenanceMs: 0 },
    };
  }
  running = true;
  const leaseOwner = randomUUID();
  let leaseAcquired = false;
  try {
    try {
      leaseAcquired = await tryAcquirePipelineLease(leaseOwner);
    } catch (err) {
      return {
        scannedAt: new Date(),
        verified: 0,
        closed: 0,
        candidates: 0,
        published: 0,
        errors: [`Unable to acquire pipeline lease: ${String(err)}`],
        timings: { totalMs: 0, verificationMs: 0, scanMs: 0, maintenanceMs: 0 },
      };
    }

    if (!leaseAcquired) {
      return {
        scannedAt: new Date(),
        verified: 0,
        closed: 0,
        candidates: 0,
        published: 0,
        errors: ["Pipeline lease held by another invocation"],
        timings: { totalMs: 0, verificationMs: 0, scanMs: 0, maintenanceMs: 0 },
      };
    }

    const report = await runPipeline();
    lastPass = Date.now();
    return report;
  } finally {
    if (leaseAcquired) {
      await releasePipelineLease(leaseOwner).catch(err =>
        console.error("[pipeline] Failed to release distributed lease:", err)
      );
    }
    running = false;
  }
}

export async function runPipeline(): Promise<PipelineReport> {
  const pipelineStartedAt = Date.now();
  const engineSnapshot = getEngineConfigSnapshot();
  console.time("pipeline-total");
  const report: PipelineReport = {
    scannedAt: new Date(),
    verified: 0,
    closed: 0,
    candidates: 0,
    published: 0,
    errors: [],
    timings: { totalMs: 0, verificationMs: 0, scanMs: 0, maintenanceMs: 0 },
  };

  /*
   * In-flight Promise caches — storing Promise<Candle[]> instead of
   * Candle[] so concurrent callers for the same key await the same
   * fetch rather than firing a second one.
   */
  const closedKlineCache = new Map<string, Promise<Candle[]>>();

  function klinesFor(
    pair: string,
    tf: Timeframe,
    source: "futures" | "spot"
  ): Promise<Candle[]> {
    const key = `${source}:${pair}:${tf}`;
    if (!closedKlineCache.has(key)) {
      closedKlineCache.set(key, fetchClosedKlines(pair, tf, 300, source));
    }
    return closedKlineCache.get(key)!;
  }

  // ---- Stage 1: grade open signals against completed candles only --------
  // Live tickers remain available to the UI, but official performance never
  // commits a result from a still-mutating candle.
  console.time("stage1-verify");
  const verificationStartedAt = Date.now();
  const openSignals = await getDb()
    .select()
    .from(signals)
    .where(eq(signals.status, "open"));

  for (const sig of openSignals) {
    const instrument = INSTRUMENTS.find(i => i.symbol === sig.symbol);
    if (!instrument) {
      const closedAt = new Date();
      await getDb().transaction(async tx => {
        await tx
          .update(signals)
          .set({ status: "undecidable", closedAt })
          .where(eq(signals.id, sig.id));
        await tx
          .insert(signalEvents)
          .values({
            eventKey: `${sig.id}:UNDECIDABLE:${closedAt.getTime()}:none`,
            signalId: sig.id,
            eventType: "UNDECIDABLE",
            price: null,
            occurredAt: closedAt,
            metadata: { reason: "instrument removed from registry" },
          })
          .onConflictDoNothing({ target: signalEvents.eventKey });
      });
      report.closed++;
      continue;
    }
    try {
      const candles = await klinesFor(
        instrument.pair,
        sig.timeframe,
        instrument.dataSource
      );
      const verdict = verifySignal(sig, candles, engineSnapshot.config);
      report.verified++;
      const signalChanged =
        verdict.status !== "open" || verdict.entryFilled !== sig.entryFilled;
      if (signalChanged || verdict.events.length > 0) {
        await getDb().transaction(async tx => {
          if (signalChanged) {
            await tx
              .update(signals)
              .set({
                status: verdict.status,
                entryFilled: verdict.entryFilled,
                exitPrice: verdict.exitPrice,
                rMultiple: verdict.rMultiple,
                closedAt: verdict.closedAt,
              })
              .where(eq(signals.id, sig.id));
          }
          if (verdict.events.length > 0) {
            await tx
              .insert(signalEvents)
              .values(
                verdict.events.map(event => ({
                  eventKey: event.eventKey,
                  signalId: sig.id,
                  eventType: event.eventType,
                  price: event.price,
                  occurredAt: event.occurredAt,
                  metadata: event.metadata,
                }))
              )
              .onConflictDoNothing({ target: signalEvents.eventKey });
          }
        });
        if (verdict.status !== "open") report.closed++;
      }
    } catch (err) {
      report.errors.push(
        `verify ${sig.symbol} ${sig.timeframe}: ${String(err)}`
      );
    }
  }
  report.timings.verificationMs = Date.now() - verificationStartedAt;
  console.timeEnd("stage1-verify");

  // ---- Stage 2: scan for new setups — timeframes parallelized -------------
  console.time("stage2-scan");
  const scanStartedAt = Date.now();
  const allScanRows: ScanRunRow[] = [];
  const fearAndGreedPromise = INSTRUMENTS.some(i => i.market === "crypto")
    ? fetchFearAndGreed().catch(() => null)
    : Promise.resolve(null);

  await Promise.all(
    INSTRUMENTS.map(async instrument => {
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
            fearAndGreedPromise,
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

      await Promise.all(
        TIMEFRAMES.map(async timeframe => {
          let candidates = 0;
          let published = 0;
          let note: string | null = null;
          try {
            const candles = await klinesFor(
              instrument.pair,
              timeframe,
              instrument.dataSource
            );
            const setup = generateSetup(
              candles,
              timeframe,
              fundingRate,
              openInterest,
              takerRatio,
              fearAndGreed,
              instrument.symbol,
              engineSnapshot.config
            );

            if (!setup) {
              note = "no setup";
            } else {
              candidates = 1;
              report.candidates++;

              const fundingActive =
                fundingRate != null && Math.abs(fundingRate) > 0.0005;
              const fundingNote = fundingActive
                ? `funding: ${fundingRate! > 0 ? "+" : ""}${fundingRate!.toFixed(6)}`
                : null;

              const htfTf = HTF_MAP[timeframe];
              const htfCandles = htfTf
                ? await klinesFor(instrument.pair, htfTf, instrument.dataSource)
                : undefined;
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
                      eq(signals.status, "open")
                    )
                  )
                  .limit(1);

                const gate = gateSetup(setup, existing.length > 0, {
                  symbol: instrument.symbol,
                });
                if (!gate.pass) {
                  const reasonText = gate.reasons.join("; ");
                  note = fundingNote
                    ? `${reasonText}; ${fundingNote}`
                    : reasonText;
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
                    strategyContext: setup.context,
                    engineConfigVersion: engineSnapshot.version,
                    engine: "rules",
                    setupAt: new Date(setup.setupAt),
                    expiresAt: new Date(Date.now() + EXPIRY_MS[timeframe]),
                  };
                  try {
                    await getDb().transaction(async tx => {
                      const [inserted] = await tx
                        .insert(signals)
                        .values(row)
                        .returning({ id: signals.id });
                      if (!inserted) {
                        throw new Error(
                          "Signal insert returned no identifier."
                        );
                      }
                      await tx.insert(signalEvents).values({
                        eventKey: `${inserted.id}:SIGNAL_CREATED:${setup.setupAt}:none`,
                        signalId: inserted.id,
                        eventType: "SIGNAL_CREATED",
                        price: null,
                        occurredAt: new Date(setup.setupAt),
                        metadata: {
                          engine: "rules",
                          engineConfigVersion: engineSnapshot.version,
                          confluenceScore: gate.confidence,
                        },
                      });
                    });
                    published = 1;
                    report.published++;
                  } catch (err) {
                    if (isUniqueViolation(err)) {
                      note = "duplicate setup (already recorded)";
                    } else {
                      note = `insert error: ${String(err)}`;
                      report.errors.push(
                        `insert ${instrument.symbol} ${timeframe}: ${String(err)}`
                      );
                    }
                  }
                }
              }
            }
          } catch (err) {
            note = `error: ${String(err)}`;
            report.errors.push(
              `scan ${instrument.symbol} ${timeframe}: ${String(err)}`
            );
          }
          allScanRows.push({
            symbol: instrument.symbol,
            timeframe,
            candidates,
            published,
            note,
          });
        })
      );
    })
  );
  report.timings.scanMs = Date.now() - scanStartedAt;
  console.timeEnd("stage2-scan");

  // ---- Batch-insert scan bookkeeping in one round-trip --------------------
  if (allScanRows.length > 0) {
    try {
      await getDb().insert(scanRuns).values(allScanRows);
    } catch (err) {
      const message = `scan_runs bookkeeping: ${String(err)}`;
      report.errors.push(message);
      console.error(`[pipeline] ${message}`);
    }
  }

  // ---- Sync fresh news & prune rolling data ------------------------------
  const maintenanceStartedAt = Date.now();
  try {
    const freshNews = await getNews(true);
    if (freshNews.length > 0) {
      await upsertNewsBatch(freshNews);
    }
    await pruneNewsOlderThan7Days();
    await pruneScanRunsOlderThan14Days();
  } catch (err) {
    report.errors.push(`maintenance: ${String(err)}`);
    console.error("[pipeline] Data sync/prune error:", err);
  }
  report.timings.maintenanceMs = Date.now() - maintenanceStartedAt;
  report.timings.totalMs = Date.now() - pipelineStartedAt;

  console.timeEnd("pipeline-total");
  return report;
}
