import type { Context } from "hono";
import { forceRunMaintenancePass } from "../engine/maintenance";
import { forceRunPipelinePass } from "../engine/pipeline";
import { forceRunVerificationPass } from "../engine/verification";
import { safeCompare } from "../lib/safeCompare";

const CRON_RESPONSE_TIMEOUT_MS = {
  verification: 55_000,
  pipeline: 85_000,
  maintenance: 70_000,
} as const;

class CronResponseTimeoutError extends Error {
  constructor(
    readonly task: keyof typeof CRON_RESPONSE_TIMEOUT_MS,
    readonly timeoutMs: number
  ) {
    super(`${task} did not finish within ${timeoutMs}ms.`);
    this.name = "CronResponseTimeoutError";
  }
}

function logCron(
  level: "info" | "warn" | "error",
  event: string,
  c: Context,
  details: Record<string, unknown> = {}
): void {
  const payload = JSON.stringify({
    level,
    event,
    requestId: c.req.header("x-vercel-id") ?? "local",
    method: c.req.method,
    path: c.req.path,
    ...details,
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.log(payload);
}

async function awaitCronTask<T>(
  task: Promise<T>,
  taskName: keyof typeof CRON_RESPONSE_TIMEOUT_MS
): Promise<T> {
  const timeoutMs = CRON_RESPONSE_TIMEOUT_MS[taskName];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new CronResponseTimeoutError(taskName, timeoutMs)),
      timeoutMs
    );
    timeout.unref?.();
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function timeoutResponse(c: Context, error: CronResponseTimeoutError) {
  logCron("error", "cron.response_timeout", c, {
    task: error.task,
    timeoutMs: error.timeoutMs,
  });
  return c.json(
    {
      ok: false,
      error: {
        code: "CRON_RESPONSE_TIMEOUT",
        message: error.message,
      },
    },
    504
  );
}

function authorizeCron(c: Context): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logCron("error", "cron.auth_config_missing", c);
    return c.json({ error: "CRON_SECRET not configured" }, 500);
  }

  const authHeader = c.req.header("authorization") ?? "";
  if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
    logCron("warn", "cron.auth_rejected", c);
    return c.json({ error: "Unauthorized" }, 401);
  }
  logCron("info", "cron.auth_accepted", c);
  return null;
}

/** Runs only lifecycle grading and returns after ledger writes are committed. */
export async function handleCronVerification(c: Context) {
  const startedAt = Date.now();
  const authError = authorizeCron(c);
  if (authError) return authError;

  try {
    const report = await awaitCronTask(
      forceRunVerificationPass(),
      "verification"
    );
    logCron("info", "cron.verification_completed", c, {
      ms: Date.now() - startedAt,
      openSignals: report.openSignals,
      closed: report.closed,
      errors: report.errors.length,
    });
    if (report.errors.length > 0) {
      return c.json({ ok: false, report }, 503);
    }
    return c.json({ ok: true, report }, 200);
  } catch (error) {
    if (error instanceof CronResponseTimeoutError) {
      return timeoutResponse(c, error);
    }
    throw error;
  }
}

/** Runs setup discovery only; verification and maintenance have separate jobs. */
export async function handleCronPipeline(c: Context) {
  const startedAt = Date.now();
  const authError = authorizeCron(c);
  if (authError) return authError;

  try {
    const report = await awaitCronTask(forceRunPipelinePass(), "pipeline");
    logCron("info", "cron.pipeline_completed", c, {
      ms: Date.now() - startedAt,
      scanTargets: report.scanTargets,
      published: report.published,
      errors: report.errors.length,
    });
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
  } catch (error) {
    if (error instanceof CronResponseTimeoutError) {
      return timeoutResponse(c, error);
    }
    throw error;
  }
}

/** Runs non-critical news synchronization and retention cleanup. */
export async function handleCronMaintenance(c: Context) {
  const startedAt = Date.now();
  const authError = authorizeCron(c);
  if (authError) return authError;

  try {
    const report = await awaitCronTask(
      forceRunMaintenancePass(),
      "maintenance"
    );
    logCron("info", "cron.maintenance_completed", c, {
      ms: Date.now() - startedAt,
      fetched: report.fetched,
      stored: report.stored,
    });
    return c.json({ ok: true, report }, 200);
  } catch (error) {
    if (error instanceof CronResponseTimeoutError) {
      return timeoutResponse(c, error);
    }
    console.error("[maintenance] pass failed", error);
    return c.json({ ok: false, error: String(error) }, 503);
  }
}
