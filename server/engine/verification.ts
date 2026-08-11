/** Independent lifecycle verification for existing open signals. */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { signalEvents, signals, type Signal } from "@db/schema";
import {
  getEffectiveSignalExpiry,
  INSTRUMENTS,
  type Timeframe,
} from "@contracts/instruments";
import { getEngineConfigSnapshot } from "../config/engineConfig";
import { runWithAbortDeadline } from "../lib/deadline";
import { getDb } from "../queries/connection";
import {
  createPostgresLeaseStore,
  PipelineLeaseAcquisitionError,
  PipelineLeaseHeartbeatError,
  PipelineLeaseHeldError,
  PipelineLeaseReleaseError,
  runWithPipelineLease,
} from "../queries/pipelineLease";
import { fetchClosedKlines, type Candle } from "./binance";
import { verifySignal, type Verdict } from "./verifier";

export const VERIFICATION_TIMEOUT_MS = 45_000;
const VERIFICATION_LEASE_NAME = "signal-verification";
const verificationLeaseStore = createPostgresLeaseStore(
  VERIFICATION_LEASE_NAME,
  2 * 60_000
);

export interface VerificationReport {
  startedAt: Date;
  completedAt: Date;
  openSignals: number;
  staleOpenSignals: number;
  verified: number;
  closed: number;
  unchanged: number;
  errors: string[];
  timings: { totalMs: number };
  failures: {
    marketData: number;
    database: number;
    leaseAcquisition: number;
    leaseRelease: number;
    heartbeat: number;
    timeout: number;
  };
}

export interface VerificationStore {
  listOpenSignals(): Promise<Signal[]>;
  markUndecidable(signal: Signal, closedAt: Date): Promise<boolean>;
  applyVerdict(
    signal: Signal,
    verdict: Verdict,
    signalChanged: boolean
  ): Promise<boolean>;
}

const postgresVerificationStore: VerificationStore = {
  async listOpenSignals() {
    return getDb().select().from(signals).where(eq(signals.status, "open"));
  },

  async markUndecidable(signal, closedAt) {
    return getDb().transaction(async tx => {
      const updated = await tx
        .update(signals)
        .set({ status: "undecidable", closedAt })
        .where(and(eq(signals.id, signal.id), eq(signals.status, "open")))
        .returning({ id: signals.id });
      if (updated.length === 0) return false;

      await tx
        .insert(signalEvents)
        .values({
          eventKey: `${signal.id}:UNDECIDABLE:${closedAt.getTime()}:none`,
          signalId: signal.id,
          eventType: "UNDECIDABLE",
          price: null,
          occurredAt: closedAt,
          metadata: { reason: "instrument removed from registry" },
        })
        .onConflictDoNothing({ target: signalEvents.eventKey });
      return true;
    });
  },

  async applyVerdict(signal, verdict, signalChanged) {
    return getDb().transaction(async tx => {
      if (signalChanged) {
        const updated = await tx
          .update(signals)
          .set({
            status: verdict.status,
            entryFilled: verdict.entryFilled,
            exitPrice: verdict.exitPrice,
            rMultiple: verdict.rMultiple,
            closedAt: verdict.closedAt,
          })
          .where(and(eq(signals.id, signal.id), eq(signals.status, "open")))
          .returning({ id: signals.id });
        if (updated.length === 0) return false;
      }

      if (verdict.events.length > 0) {
        await tx
          .insert(signalEvents)
          .values(
            verdict.events.map(event => ({
              eventKey: event.eventKey,
              signalId: signal.id,
              eventType: event.eventType,
              price: event.price,
              occurredAt: event.occurredAt,
              metadata: event.metadata,
            }))
          )
          .onConflictDoNothing({ target: signalEvents.eventKey });
      }
      return true;
    });
  },
};

interface VerificationDependencies {
  store?: VerificationStore;
  fetchKlines?: typeof fetchClosedKlines;
  now?: () => number;
}

function createReport(startedAt = new Date()): VerificationReport {
  return {
    startedAt,
    completedAt: startedAt,
    openSignals: 0,
    staleOpenSignals: 0,
    verified: 0,
    closed: 0,
    unchanged: 0,
    errors: [],
    timings: { totalMs: 0 },
    failures: {
      marketData: 0,
      database: 0,
      leaseAcquisition: 0,
      leaseRelease: 0,
      heartbeat: 0,
      timeout: 0,
    },
  };
}

function assertVerificationActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Verification pass aborted.");
  }
}

export async function runVerificationPass(
  signal?: AbortSignal,
  dependencies: VerificationDependencies = {}
): Promise<VerificationReport> {
  const startedAtMs = Date.now();
  const report = createReport(new Date(startedAtMs));
  const store = dependencies.store ?? postgresVerificationStore;
  const fetchKlines = dependencies.fetchKlines ?? fetchClosedKlines;
  const now = dependencies.now ?? Date.now;
  const engineConfig = getEngineConfigSnapshot().config;
  const klineCache = new Map<string, Promise<Candle[]>>();

  console.log("[verification] pass started");
  const openSignals = await store.listOpenSignals();
  report.openSignals = openSignals.length;
  report.staleOpenSignals = openSignals.filter(
    sig =>
      getEffectiveSignalExpiry(
        sig.market,
        sig.timeframe,
        sig.openedAt,
        sig.expiresAt
      ).getTime() <= now()
  ).length;
  if (report.staleOpenSignals > 0) {
    console.warn(
      `[verification] ${report.staleOpenSignals} open signal(s) passed their effective expiry before this pass`
    );
  }

  // Start all distinct market-data requests before awaiting any one signal.
  // This keeps verification bounded by the slowest feed rather than their sum.
  for (const openSignal of openSignals) {
    const instrument = INSTRUMENTS.find(i => i.symbol === openSignal.symbol);
    if (!instrument) continue;
    const key = `${instrument.dataSource}:${instrument.pair}:${openSignal.timeframe}`;
    if (!klineCache.has(key)) {
      klineCache.set(
        key,
        fetchKlines(
          instrument.pair,
          openSignal.timeframe as Timeframe,
          300,
          instrument.dataSource
        )
      );
    }
  }
  await Promise.allSettled(klineCache.values());
  assertVerificationActive(signal);

  for (const openSignal of openSignals) {
    assertVerificationActive(signal);
    const instrument = INSTRUMENTS.find(i => i.symbol === openSignal.symbol);
    if (!instrument) {
      try {
        const changed = await store.markUndecidable(
          openSignal,
          new Date(now())
        );
        if (changed) report.closed++;
        else report.unchanged++;
      } catch (error) {
        report.failures.database++;
        report.errors.push(
          `verify database ${openSignal.symbol} ${openSignal.timeframe}: ${String(error)}`
        );
      }
      continue;
    }

    const key = `${instrument.dataSource}:${instrument.pair}:${openSignal.timeframe}`;
    const candlesPromise = klineCache.get(key)!;

    let candles: Candle[];
    try {
      candles = await candlesPromise;
    } catch (error) {
      assertVerificationActive(signal);
      report.failures.marketData++;
      report.errors.push(
        `verify market data ${openSignal.symbol} ${openSignal.timeframe}: ${String(error)}`
      );
      continue;
    }

    const verdict = verifySignal(openSignal, candles, engineConfig);
    report.verified++;
    const signalChanged =
      verdict.status !== "open" ||
      verdict.entryFilled !== openSignal.entryFilled;
    if (!signalChanged && verdict.events.length === 0) {
      report.unchanged++;
      continue;
    }

    try {
      assertVerificationActive(signal);
      const applied = await store.applyVerdict(
        openSignal,
        verdict,
        signalChanged
      );
      if (!applied) {
        report.unchanged++;
      } else if (verdict.status !== "open") {
        report.closed++;
      } else {
        report.unchanged++;
      }
    } catch (error) {
      assertVerificationActive(signal);
      report.failures.database++;
      report.errors.push(
        `verify database ${openSignal.symbol} ${openSignal.timeframe}: ${String(error)}`
      );
    }
  }

  report.completedAt = new Date();
  report.timings.totalMs = Date.now() - startedAtMs;
  console.log("[verification] pass completed", JSON.stringify(report));
  return report;
}

let verificationRunning = false;

export async function forceRunVerificationPass(): Promise<VerificationReport> {
  const startedAt = Date.now();
  if (verificationRunning) {
    const report = createReport();
    report.errors.push("Verification pass already running");
    return report;
  }

  verificationRunning = true;
  try {
    return await runWithPipelineLease(
      randomUUID(),
      leaseSignal =>
        runWithAbortDeadline(
          leaseSignal,
          VERIFICATION_TIMEOUT_MS,
          "Verification pass",
          verificationSignal => runVerificationPass(verificationSignal)
        ),
      { store: verificationLeaseStore, heartbeatMs: 30_000 }
    );
  } catch (error) {
    const report = createReport(new Date(startedAt));
    report.completedAt = new Date();
    report.timings.totalMs = Date.now() - startedAt;
    if (error instanceof PipelineLeaseHeartbeatError) {
      report.failures.heartbeat++;
    } else if (
      error instanceof PipelineLeaseHeldError ||
      error instanceof PipelineLeaseAcquisitionError
    ) {
      report.failures.leaseAcquisition++;
    } else if (error instanceof PipelineLeaseReleaseError) {
      report.failures.leaseRelease++;
    } else if (String(error).toLowerCase().includes("deadline")) {
      report.failures.timeout++;
    } else {
      report.failures.database++;
    }
    report.errors.push(String(error));
    console.error("[verification] pass failed", error);
    return report;
  } finally {
    verificationRunning = false;
  }
}
