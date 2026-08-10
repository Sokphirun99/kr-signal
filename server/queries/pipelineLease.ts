import { and, eq, sql } from "drizzle-orm";
import { pipelineLeases } from "@db/schema";
import { getDb } from "./connection";

const PIPELINE_LEASE_NAME = "signal-pipeline";
const PIPELINE_LEASE_MS = 6 * 60_000;

/**
 * Atomically acquires or steals an expired pipeline lease. This is safe across
 * Vercel instances and Supabase transaction-pooler connections because no
 * session affinity or long-running transaction is required.
 */
export async function tryAcquirePipelineLease(owner: string): Promise<boolean> {
  const expiresAt = new Date(Date.now() + PIPELINE_LEASE_MS);
  const rows = await getDb().execute<{ owner: string }>(sql`
    insert into private.pipeline_leases (name, owner, expires_at, updated_at)
    values (
      ${PIPELINE_LEASE_NAME},
      ${owner},
      ${expiresAt.toISOString()}::timestamptz,
      now()
    )
    on conflict (name) do update
      set owner = excluded.owner,
          expires_at = excluded.expires_at,
          updated_at = now()
      where private.pipeline_leases.expires_at <= now()
    returning owner
  `);

  return rows.some((row) => row.owner === owner);
}

/** Releases only the caller's lease; an expired lease stolen by another worker is untouched. */
export async function releasePipelineLease(owner: string): Promise<void> {
  await getDb()
    .delete(pipelineLeases)
    .where(
      and(
        eq(pipelineLeases.name, PIPELINE_LEASE_NAME),
        eq(pipelineLeases.owner, owner),
      ),
    );
}
