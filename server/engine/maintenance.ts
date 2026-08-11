/** Non-critical news synchronization and rolling-data cleanup. */

import { randomUUID } from "node:crypto";
import { runWithAbortDeadline } from "../lib/deadline";
import {
  createPostgresLeaseStore,
  runWithPipelineLease,
} from "../queries/pipelineLease";
import { getNews } from "./news";
import { pruneNewsOlderThan7Days, upsertNewsBatch } from "../queries/news";
import { pruneScanRunsOlderThan14Days } from "../queries/signals";

export const MAINTENANCE_TIMEOUT_MS = 60_000;
const maintenanceLeaseStore = createPostgresLeaseStore(
  "signal-maintenance",
  2 * 60_000
);

export interface MaintenanceReport {
  startedAt: Date;
  completedAt: Date;
  fetched: number;
  stored: number;
  newsPruned: number;
  scanRunsPruned: number;
  errors: string[];
  totalMs: number;
}

function assertMaintenanceActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Maintenance pass aborted.");
  }
}

export async function runMaintenancePass(
  signal: AbortSignal
): Promise<MaintenanceReport> {
  const startedAtMs = Date.now();
  const report: MaintenanceReport = {
    startedAt: new Date(startedAtMs),
    completedAt: new Date(startedAtMs),
    fetched: 0,
    stored: 0,
    newsPruned: 0,
    scanRunsPruned: 0,
    errors: [],
    totalMs: 0,
  };

  console.log("[maintenance] pass started");
  assertMaintenanceActive(signal);
  const freshNews = await getNews(true);
  report.fetched = freshNews.length;
  assertMaintenanceActive(signal);
  report.stored = await upsertNewsBatch(freshNews);
  assertMaintenanceActive(signal);
  report.newsPruned = await pruneNewsOlderThan7Days();
  assertMaintenanceActive(signal);
  report.scanRunsPruned = await pruneScanRunsOlderThan14Days();
  report.completedAt = new Date();
  report.totalMs = Date.now() - startedAtMs;
  console.log("[maintenance] pass completed", JSON.stringify(report));
  return report;
}

export async function forceRunMaintenancePass(): Promise<MaintenanceReport> {
  return runWithPipelineLease(
    randomUUID(),
    leaseSignal =>
      runWithAbortDeadline(
        leaseSignal,
        MAINTENANCE_TIMEOUT_MS,
        "Maintenance pass",
        maintenanceSignal => runMaintenancePass(maintenanceSignal)
      ),
    { store: maintenanceLeaseStore, heartbeatMs: 30_000 }
  );
}
