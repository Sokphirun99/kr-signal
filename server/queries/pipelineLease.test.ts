import { describe, expect, it } from "vitest";
import {
  PIPELINE_LEASE_MS,
  PipelineLeaseHeartbeatError,
  runWithPipelineLease,
  type PipelineLeaseStore,
} from "./pipelineLease";

class MemoryLeaseStore implements PipelineLeaseStore {
  lease: { owner: string; expiresAt: number } | null = null;
  releases: string[] = [];

  async acquire(owner: string, now = new Date()): Promise<boolean> {
    if (this.lease && this.lease.expiresAt > now.getTime()) return false;
    this.lease = { owner, expiresAt: now.getTime() + PIPELINE_LEASE_MS };
    return true;
  }

  async renew(owner: string, now = new Date()): Promise<boolean> {
    if (
      !this.lease ||
      this.lease.owner !== owner ||
      this.lease.expiresAt <= now.getTime()
    ) {
      return false;
    }
    this.lease.expiresAt = now.getTime() + PIPELINE_LEASE_MS;
    return true;
  }

  async release(owner: string): Promise<boolean> {
    this.releases.push(owner);
    if (!this.lease || this.lease.owner !== owner) return false;
    this.lease = null;
    return true;
  }
}

class ManualScheduler {
  callback: (() => void) | null = null;
  clearCount = 0;

  set(callback: () => void): object {
    this.callback = callback;
    return {};
  }

  clear(): void {
    this.clearCount++;
    this.callback = null;
  }

  tick(): void {
    this.callback?.();
  }
}

describe("distributed pipeline lease", () => {
  it("lets the first worker acquire while rejecting a second active worker", async () => {
    const store = new MemoryLeaseStore();
    const now = new Date("2026-08-10T00:00:00Z");
    await expect(store.acquire("worker-a", now)).resolves.toBe(true);
    await expect(store.acquire("worker-b", now)).resolves.toBe(false);
  });

  it("allows only the active owner to renew", async () => {
    const store = new MemoryLeaseStore();
    const acquiredAt = new Date("2026-08-10T00:00:00Z");
    await store.acquire("worker-a", acquiredAt);
    const originalExpiry = store.lease?.expiresAt;

    await expect(
      store.renew("worker-b", new Date(acquiredAt.getTime() + 1_000))
    ).resolves.toBe(false);
    expect(store.lease?.expiresAt).toBe(originalExpiry);
    await expect(
      store.renew("worker-a", new Date(acquiredAt.getTime() + 2_000))
    ).resolves.toBe(true);
    expect(store.lease?.expiresAt).toBeGreaterThan(originalExpiry ?? 0);
  });

  it("allows takeover after expiry and prevents the old owner from releasing it", async () => {
    const store = new MemoryLeaseStore();
    const acquiredAt = new Date("2026-08-10T00:00:00Z");
    await store.acquire("worker-a", acquiredAt);
    const afterExpiry = new Date(acquiredAt.getTime() + PIPELINE_LEASE_MS + 1);

    await expect(store.acquire("worker-b", afterExpiry)).resolves.toBe(true);
    await expect(store.release("worker-a")).resolves.toBe(false);
    expect(store.lease?.owner).toBe("worker-b");
  });

  it("clears the heartbeat and releases after pipeline success", async () => {
    const store = new MemoryLeaseStore();
    const scheduler = new ManualScheduler();

    await expect(
      runWithPipelineLease("worker-a", async () => "done", {
        store,
        scheduler,
      })
    ).resolves.toBe("done");
    expect(scheduler.clearCount).toBe(1);
    expect(store.lease).toBeNull();
  });

  it("clears the heartbeat and releases after a pipeline error", async () => {
    const store = new MemoryLeaseStore();
    const scheduler = new ManualScheduler();

    await expect(
      runWithPipelineLease(
        "worker-a",
        async () => {
          throw new Error("pipeline failed");
        },
        { store, scheduler }
      )
    ).rejects.toThrow("pipeline failed");
    expect(scheduler.clearCount).toBe(1);
    expect(store.lease).toBeNull();
  });

  it("aborts and reports a rejected heartbeat renewal", async () => {
    const store = new MemoryLeaseStore();
    const scheduler = new ManualScheduler();
    const run = runWithPipelineLease(
      "worker-a",
      signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
      { store, scheduler }
    );
    await Promise.resolve();
    store.lease = { owner: "worker-b", expiresAt: Date.now() + 60_000 };
    scheduler.tick();

    await expect(run).rejects.toBeInstanceOf(PipelineLeaseHeartbeatError);
    expect(scheduler.clearCount).toBe(1);
    expect(store.lease?.owner).toBe("worker-b");
  });
});
