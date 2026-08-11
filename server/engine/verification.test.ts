import { afterEach, describe, expect, it, vi } from "vitest";
import type { Signal } from "@db/schema";
import type { Candle } from "./binance";
import { runVerificationPass, type VerificationStore } from "./verification";
import type { Verdict } from "./verifier";

function openSellSignal(): Signal {
  return {
    id: 75,
    symbol: "BTCUSDT",
    market: "crypto",
    timeframe: "15m",
    style: "trend",
    side: "sell",
    entry: 100,
    stopLoss: 105,
    tp1: 95,
    tp2: 90,
    tp3: 85,
    confidence: 74,
    strategyContext: null,
    engineConfigVersion: 1,
    status: "open",
    engine: "rules",
    entryFilled: false,
    rMultiple: null,
    exitPrice: null,
    setupAt: new Date("2026-08-11T00:00:00.000Z"),
    openedAt: new Date("2026-08-11T00:00:00.000Z"),
    expiresAt: new Date("2026-08-11T04:00:00.000Z"),
    closedAt: null,
  };
}

class MemoryVerificationStore implements VerificationStore {
  signals = [openSellSignal()];
  verdicts: Verdict[] = [];

  async listOpenSignals(): Promise<Signal[]> {
    return this.signals.filter(signal => signal.status === "open");
  }

  async markUndecidable(signal: Signal, closedAt: Date): Promise<boolean> {
    const row = this.signals.find(candidate => candidate.id === signal.id);
    if (!row || row.status !== "open") return false;
    row.status = "undecidable";
    row.closedAt = closedAt;
    return true;
  }

  async applyVerdict(
    signal: Signal,
    verdict: Verdict,
    signalChanged: boolean
  ): Promise<boolean> {
    const row = this.signals.find(candidate => candidate.id === signal.id);
    if (!row || row.status !== "open") return false;
    this.verdicts.push(verdict);
    if (signalChanged) {
      row.status = verdict.status;
      row.entryFilled = verdict.entryFilled;
      row.exitPrice = verdict.exitPrice;
      row.rMultiple = verdict.rMultiple;
      row.closedAt = verdict.closedAt;
    }
    return true;
  }
}

const candles: Candle[] = [
  {
    openTime: Date.parse("2026-08-11T00:15:00.000Z"),
    open: 101,
    high: 102,
    low: 99,
    close: 100,
    volume: 1_000,
  },
  {
    openTime: Date.parse("2026-08-11T00:30:00.000Z"),
    open: 103,
    high: 106,
    low: 102,
    close: 105,
    volume: 1_200,
  },
];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("independent lifecycle verification", () => {
  it("closes a filled signal at stop-loss and is idempotent on the next pass", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T05:00:00.000Z"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new MemoryVerificationStore();
    const fetchKlines = vi.fn().mockResolvedValue(candles);

    const first = await runVerificationPass(undefined, {
      store,
      fetchKlines,
      now: Date.now,
    });

    expect(first.openSignals).toBe(1);
    expect(first.staleOpenSignals).toBe(1);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("verification.stale_open_signals")
    );
    expect(first.verified).toBe(1);
    expect(first.closed).toBe(1);
    expect(first.errors).toEqual([]);
    expect(store.signals[0].status).toBe("sl");
    expect(store.signals[0].entryFilled).toBe(true);
    expect(store.signals[0].rMultiple).toBe(-1);
    expect(store.verdicts[0].events.map(event => event.eventType)).toEqual([
      "ENTRY_FILLED",
      "CLOSED",
    ]);

    const second = await runVerificationPass(undefined, {
      store,
      fetchKlines,
      now: Date.now,
    });

    expect(second.openSignals).toBe(0);
    expect(second.closed).toBe(0);
    expect(store.verdicts).toHaveLength(1);
    expect(fetchKlines).toHaveBeenCalledTimes(1);
  });

  it("reports market-data failure without mutating the ledger", async () => {
    const store = new MemoryVerificationStore();
    const report = await runVerificationPass(undefined, {
      store,
      fetchKlines: vi.fn().mockRejectedValue(new Error("market unavailable")),
    });

    expect(report.failures.marketData).toBe(1);
    expect(report.errors[0]).toContain("market unavailable");
    expect(store.signals[0].status).toBe("open");
    expect(store.verdicts).toEqual([]);
  });
});
