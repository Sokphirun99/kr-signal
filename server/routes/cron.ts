import type { Context } from "hono";
import { forceRunPipelinePass } from "../engine/pipeline";
import { safeCompare } from "../lib/safeCompare";

/**
 * Handles incoming cron job trigger requests to execute pipeline passes.
 * Inputs: c - Hono request context.
 * Outputs: JSON response with execution report or structured error.
 * Side effects: executes the scan/pipeline pass and writes ledger/scan entries.
 * Failure modes: returns 401 on bad/missing bearer secret, 500 on execution error.
 */
export async function handleCronPipeline(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return c.json({ error: "CRON_SECRET not configured" }, 500);
  }
  const authHeader = c.req.header("authorization") ?? "";
  const expectedAuth = `Bearer ${cronSecret}`;
  if (!safeCompare(authHeader, expectedAuth)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const report = await forceRunPipelinePass();
    return c.json(report);
  } catch (err) {
    console.error("/api/cron/pipeline error:", err);
    return c.json({ error: "Pipeline pass execution failed." }, 500);
  }
}
