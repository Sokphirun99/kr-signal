import { sql } from "drizzle-orm";
import { getDb } from "./connection";

export const PIPELINE_LEASE_NAME = "signal-pipeline";
export const PIPELINE_LEASE_MS = 6 * 60_000;
export const PIPELINE_HEARTBEAT_MS = 2 * 60_000;

export interface PipelineLeaseStore {
  acquire(owner: string, now?: Date): Promise<boolean>;
  renew(owner: string, now?: Date): Promise<boolean>;
  release(owner: string): Promise<boolean>;
}

/**
 * Single-statement lease operations work with Supabase transaction pooling:
 * they need neither session affinity nor a long-running transaction.
 */
export function createPostgresLeaseStore(
  leaseName: string,
  leaseMs = PIPELINE_LEASE_MS
): PipelineLeaseStore {
  return {
    async acquire(owner) {
      const rows = await getDb().execute<{ owner: string }>(sql`
      insert into private.pipeline_leases (name, owner, expires_at, updated_at)
      values (
        ${leaseName},
        ${owner},
        now() + (${leaseMs} * interval '1 millisecond'),
        now()
      )
      on conflict (name) do update
        set owner = excluded.owner,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at
        where private.pipeline_leases.expires_at <= now()
      returning owner
      `);
      return rows.some(row => row.owner === owner);
    },

    async renew(owner) {
      const rows = await getDb().execute<{ owner: string }>(sql`
      update private.pipeline_leases
      set expires_at = now() + (${leaseMs} * interval '1 millisecond'),
          updated_at = now()
      where name = ${leaseName}
        and owner = ${owner}
        and expires_at > now()
      returning owner
      `);
      return rows.some(row => row.owner === owner);
    },

    async release(owner) {
      const rows = await getDb().execute<{ owner: string }>(sql`
      delete from private.pipeline_leases
      where name = ${leaseName}
        and owner = ${owner}
      returning owner
      `);
      return rows.some(row => row.owner === owner);
    },
  };
}

export const postgresPipelineLeaseStore = createPostgresLeaseStore(
  PIPELINE_LEASE_NAME
);

export function tryAcquirePipelineLease(owner: string): Promise<boolean> {
  return postgresPipelineLeaseStore.acquire(owner);
}

export function renewPipelineLease(owner: string): Promise<boolean> {
  return postgresPipelineLeaseStore.renew(owner);
}

export async function releasePipelineLease(owner: string): Promise<void> {
  await postgresPipelineLeaseStore.release(owner);
}

export class PipelineLeaseHeldError extends Error {
  constructor() {
    super("Pipeline lease held by another invocation");
    this.name = "PipelineLeaseHeldError";
  }
}

export class PipelineLeaseAcquisitionError extends Error {
  constructor(cause: unknown) {
    super(`Unable to acquire pipeline lease: ${String(cause)}`, { cause });
    this.name = "PipelineLeaseAcquisitionError";
  }
}

export class PipelineLeaseReleaseError extends Error {
  constructor(cause: unknown) {
    super(`Unable to release pipeline lease: ${String(cause)}`, { cause });
    this.name = "PipelineLeaseReleaseError";
  }
}

export class PipelineLeaseHeartbeatError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PipelineLeaseHeartbeatError";
  }
}

interface HeartbeatScheduler {
  set(callback: () => void, intervalMs: number): unknown;
  clear(handle: unknown): void;
}

const defaultScheduler: HeartbeatScheduler = {
  set(callback, intervalMs) {
    const timer = setInterval(callback, intervalMs);
    timer.unref?.();
    return timer;
  },
  clear(handle) {
    clearInterval(handle as ReturnType<typeof setInterval>);
  },
};

export interface PipelineLeaseRunOptions {
  store?: PipelineLeaseStore;
  heartbeatMs?: number;
  scheduler?: HeartbeatScheduler;
}

/**
 * Runs one pass while maintaining ownership in the database. A failed renewal
 * aborts the pass cooperatively and is surfaced to the caller; cleanup always
 * stops the timer and an old owner can never delete a replacement lease.
 */
export async function runWithPipelineLease<T>(
  owner: string,
  task: (signal: AbortSignal) => Promise<T>,
  options: PipelineLeaseRunOptions = {}
): Promise<T> {
  const store = options.store ?? postgresPipelineLeaseStore;
  let acquired: boolean;
  try {
    acquired = await store.acquire(owner);
  } catch (error) {
    throw new PipelineLeaseAcquisitionError(error);
  }
  if (!acquired) throw new PipelineLeaseHeldError();

  const controller = new AbortController();
  const scheduler = options.scheduler ?? defaultScheduler;
  let heartbeatInFlight: Promise<void> | null = null;
  let rejectHeartbeat: (reason: PipelineLeaseHeartbeatError) => void = () => {};
  const heartbeatFailure = new Promise<never>((_resolve, reject) => {
    rejectHeartbeat = reject;
  });

  const heartbeat = scheduler.set(() => {
    if (heartbeatInFlight || controller.signal.aborted) return;
    heartbeatInFlight = store
      .renew(owner)
      .then(renewed => {
        if (!renewed) {
          throw new PipelineLeaseHeartbeatError(
            "Pipeline lease renewal was rejected because ownership was lost or the lease expired."
          );
        }
      })
      .catch(error => {
        const heartbeatError =
          error instanceof PipelineLeaseHeartbeatError
            ? error
            : new PipelineLeaseHeartbeatError(
                `Pipeline lease renewal failed: ${String(error)}`,
                { cause: error }
              );
        controller.abort(heartbeatError);
        rejectHeartbeat(heartbeatError);
      })
      .finally(() => {
        heartbeatInFlight = null;
      });
  }, options.heartbeatMs ?? PIPELINE_HEARTBEAT_MS);

  const taskPromise = task(controller.signal);
  let primaryError: unknown;
  let releaseError: PipelineLeaseReleaseError | undefined;
  let result: T | undefined;
  try {
    result = await Promise.race([taskPromise, heartbeatFailure]);
  } catch (error) {
    primaryError = error;
    if (controller.signal.aborted) {
      await taskPromise.catch(() => undefined);
    }
  } finally {
    controller.abort();
    scheduler.clear(heartbeat);
    const finalHeartbeat = heartbeatInFlight as Promise<void> | null;
    if (finalHeartbeat) await finalHeartbeat.catch(() => undefined);
    try {
      await store.release(owner);
    } catch (error) {
      releaseError = new PipelineLeaseReleaseError(error);
    }
  }

  if (primaryError) {
    if (releaseError) {
      console.error(
        "[pipeline] Lease release failed after pass error:",
        releaseError
      );
    }
    throw primaryError;
  }
  if (releaseError) throw releaseError;
  return result as T;
}
