import type { Context } from "hono";
import { waitUntil } from "@vercel/functions";
import { forceRunPipelinePass } from "../engine/pipeline";
import { safeCompare } from "../lib/safeCompare";

/**
 * Handles incoming cron job trigger requests to execute pipeline passes.
 * Responds 202 Accepted immediately and runs the pipeline in the background
 * via Vercel's Fluid Compute `waitUntil`, so the HTTP layer never hits the
 * Hobby-tier 300s function limit.
 *
 * Inputs: c - Hono request context with Bearer authorization header.
 * Outputs: 202 JSON with `accepted` flag and `startedAt` timestamp.
 * Side effects: fires off the pipeline pass asynchronously (writes signals/scan_runs).
 * Failure modes: 500 if CRON_SECRET is unset, 401 on bad/missing bearer token.
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

  waitUntil(
    forceRunPipelinePass()
      .then((report) =>
        console.log("[cron] pass done", JSON.stringify(report)),
      )
      .catch((err) => console.error("[cron] pass failed", err)),
  );

  return c.json(
    { accepted: true, startedAt: new Date().toISOString() },
    202,
  );
}
