/**
 * Pipeline orchestrator.
 *
 * Pipeline passes are started only by the authenticated cron/manual scan
 * route. Public read requests never run market scans, so visitor traffic
 * cannot multiply exchange and database work.
 *
 * Timeframes within each instrument are parallelized via Promise.all.
 * Kline caches store Promises (not resolved values) to avoid duplicate
 * in-flight fetches under concurrency.
 */

import { getDb } from "../queries/connection";
import { signals, scanRuns, signalEvents, type InsertSignal } from "@db/schema";
import { and, eq } from "drizzle-orm";
import {
  INSTRUMENTS,
  TIMEFRAMES,
  getSignalExpiryMs,
  type Timeframe,
} from "@contracts/instruments";
import { type Candle, fetchClosedKlines } from "./binance";
import { generateSetup, HTF_MAP, isHtfVetoed } from "./strategy";
import { gateSetup } from "./gate";
import {
  fetchFundingRate,
  fetchOpenInterest,
  fetchTakerRatio,
  fetchFearAndGreed,
} from "./futures";
import { randomUUID } from "node:crypto";
import {
  PipelineLeaseAcquisitionError,
  PipelineLeaseHeartbeatError,
  PipelineLeaseHeldError,
  PipelineLeaseReleaseError,
  runWithPipelineLease,
} from "../queries/pipelineLease";
import { isUniqueViolation } from "../lib/postgresError";
import { getEngineConfigSnapshot } from "../config/engineConfig";
import {
  AI_FORECAST_CONTEXT_CANDLES,
  getAiForecast,
  isAiForecastEnabled,
} from "./aiForecast";
import { runWithAbortDeadline } from "../lib/deadline";

let running = false;
export const PIPELINE_TIMEOUT_MS = 75_000;

export interface PassReport {
  scannedAt?: Date;
  scanTargets: number;
  instrumentsScanned: number;
  timeframesScanned: number;
  candidates: number;
  published: number;
  errors: string[];
  timings: {
    totalMs: number;
    scanMs: number;
  };
  failures: {
    marketData: number;
    database: number;
    leaseAcquisition: number;
    leaseRelease: number;
    heartbeat: number;
    timeout: number;
    scan: number;
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

function newPassReport(scannedAt = new Date()): PipelineReport {
  return {
    scannedAt,
    scanTargets: 0,
    instrumentsScanned: 0,
    timeframesScanned: 0,
    candidates: 0,
    published: 0,
    errors: [],
    timings: { totalMs: 0, scanMs: 0 },
    failures: {
      marketData: 0,
      database: 0,
      leaseAcquisition: 0,
      leaseRelease: 0,
      heartbeat: 0,
      timeout: 0,
      scan: 0,
    },
  };
}

function assertPipelineActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Pipeline pass aborted after lease loss.");
  }
}

export async function forceRunPipelinePass(): Promise<PipelineReport> {
  const startedAt = Date.now();
  if (running) {
    const report = newPassReport();
    report.errors.push("Pipeline pass already running");
    return report;
  }
  running = true;
  const leaseOwner = randomUUID();
  try {
    const report = await runWithPipelineLease(leaseOwner, signal =>
      runWithAbortDeadline(
        signal,
        PIPELINE_TIMEOUT_MS,
        "Pipeline scan",
        scanSignal => runPipeline(scanSignal)
      )
    );
    return report;
  } catch (error) {
    const report = newPassReport();
    report.timings.totalMs = Date.now() - startedAt;
    if (error instanceof PipelineLeaseHeartbeatError) {
      report.failures.heartbeat++;
      report.errors.push(error.message);
    } else if (
      error instanceof PipelineLeaseHeldError ||
      error instanceof PipelineLeaseAcquisitionError
    ) {
      report.failures.leaseAcquisition++;
      report.errors.push(error.message);
    } else if (error instanceof PipelineLeaseReleaseError) {
      report.failures.leaseRelease++;
      report.errors.push(error.message);
    } else if (String(error).toLowerCase().includes("deadline")) {
      report.failures.timeout++;
      report.errors.push(`Pipeline execution failed: ${String(error)}`);
    } else {
      report.failures.database++;
      report.errors.push(`Pipeline execution failed: ${String(error)}`);
    }
    return report;
  } finally {
    running = false;
  }
}

export async function runPipeline(
  signal?: AbortSignal
): Promise<PipelineReport> {
  const pipelineStartedAt = Date.now();
  const engineSnapshot = getEngineConfigSnapshot();
  console.time("pipeline-total");
  const report = newPassReport();

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

  // ---- Scan for new setups — lifecycle verification runs separately ------
  console.time("stage-scan");
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
        const missingInputs = [fr, oi, tr, fg].filter(
          value => value == null
        ).length;
        if (missingInputs > 0) {
          report.failures.marketData += missingInputs;
          report.errors.push(
            `market data ${instrument.symbol}: ${missingInputs} optional futures/sentiment input(s) unavailable`
          );
        }
      }

      await Promise.all(
        TIMEFRAMES.map(async timeframe => {
          assertPipelineActive(signal);
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

                  let strategyContext: Record<string, unknown> = setup.context;
                  if (
                    instrument.market === "crypto" &&
                    isAiForecastEnabled()
                  ) {
                    try {
                      const forecastCandles =
                        candles.length >= AI_FORECAST_CONTEXT_CANDLES
                          ? candles
                          : await fetchClosedKlines(
                              instrument.pair,
                              timeframe,
                              600,
                              instrument.dataSource
                            );
                      const aiForecast = await getAiForecast(
                        {
                          symbol: instrument.symbol,
                          timeframe,
                          candles: forecastCandles,
                        },
                        { signal }
                      );
                      if (aiForecast) {
                        strategyContext = { ...setup.context, aiForecast };
                      }
                    } catch {
                      // Optional market-data or Space failures must not block rules.
                    }
                    assertPipelineActive(signal);
                  }

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
                    strategyContext,
                    engineConfigVersion: engineSnapshot.version,
                    engine: "rules",
                    setupAt: new Date(setup.setupAt),
                    expiresAt: new Date(
                      Date.now() +
                        getSignalExpiryMs(instrument.market, timeframe)
                    ),
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
                      report.failures.database++;
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
            assertPipelineActive(signal);
            note = `error: ${String(err)}`;
            report.failures.marketData++;
            report.failures.scan++;
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
          report.scanTargets++;
        })
      );
    })
  );
  report.timings.scanMs = Date.now() - scanStartedAt;
  report.timeframesScanned = allScanRows.length;
  report.instrumentsScanned = new Set(allScanRows.map(row => row.symbol)).size;
  console.timeEnd("stage-scan");

  // ---- Batch-insert scan bookkeeping in one round-trip --------------------
  if (allScanRows.length > 0) {
    try {
      assertPipelineActive(signal);
      await getDb().insert(scanRuns).values(allScanRows);
    } catch (err) {
      assertPipelineActive(signal);
      report.failures.database++;
      const message = `scan_runs bookkeeping: ${String(err)}`;
      report.errors.push(message);
      console.error(`[pipeline] ${message}`);
    }
  }

  report.timings.totalMs = Date.now() - pipelineStartedAt;

  console.timeEnd("pipeline-total");
  return report;
}
