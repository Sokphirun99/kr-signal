import type { Context } from "hono";
import { forceRunMaintenancePass } from "../engine/maintenance";
import { forceRunPipelinePass } from "../engine/pipeline";
import { forceRunVerificationPass } from "../engine/verification";
import { safeCompare } from "../lib/safeCompare";

function authorizeCron(c: Context): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return c.json({ error: "CRON_SECRET not configured" }, 500);
  }

  const authHeader = c.req.header("authorization") ?? "";
  if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return null;
}

/** Runs only lifecycle grading and returns after ledger writes are committed. */
export async function handleCronVerification(c: Context) {
  const authError = authorizeCron(c);
  if (authError) return authError;

  const report = await forceRunVerificationPass();
  if (report.errors.length > 0) {
    return c.json({ ok: false, report }, 503);
  }
  return c.json({ ok: true, report }, 200);
}

/** Runs setup discovery only; verification and maintenance have separate jobs. */
export async function handleCronPipeline(c: Context) {
  const authError = authorizeCron(c);
  if (authError) return authError;

  const report = await forceRunPipelinePass();
  const criticalFailure =
    report.failures.database > 0 ||
    report.failures.leaseAcquisition > 0 ||
    report.failures.leaseRelease > 0 ||
    report.failures.heartbeat > 0 ||
    report.failures.timeout > 0 ||
    (report.scanTargets > 0 && report.failures.scan >= report.scanTargets) ||
    report.timeframesScanned === 0;
  if (criticalFailure) {
    return c.json({ ok: false, report }, 503);
  }
  return c.json({ ok: true, report }, 200);
}

/** Runs non-critical news synchronization and retention cleanup. */
export async function handleCronMaintenance(c: Context) {
  const authError = authorizeCron(c);
  if (authError) return authError;

  try {
    const report = await forceRunMaintenancePass();
    return c.json({ ok: true, report }, 200);
  } catch (error) {
    console.error("[maintenance] pass failed", error);
    return c.json({ ok: false, error: String(error) }, 503);
  }
}
