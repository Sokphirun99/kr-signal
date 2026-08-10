import { describe, it, expect, beforeEach } from "vitest";
import { verifySignal } from "./verifier";
import { setEngineConfig } from "../config/engineConfig";
import type { Signal } from "@db/schema";
import { getEffectiveSignalExpiry } from "@contracts/instruments";
import type { Candle } from "./binance";

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  const setupAt = new Date("2026-01-01T00:00:00Z");
  return {
    id: 1,
    symbol: "BTCUSDT",
    market: "crypto",
    timeframe: "1h",
    style: "trend",
    side: "buy",
    entry: 100,
    stopLoss: 90,
    tp1: 115,
    tp2: 125,
    tp3: 140,
    confidence: 75,
    strategyContext: null,
    engineConfigVersion: 1,
    status: "open",
    engine: "rules",
    entryFilled: false,
    rMultiple: null,
    exitPrice: null,
    setupAt,
    openedAt: setupAt,
    expiresAt: new Date(setupAt.getTime() + 86_400_000),
    closedAt: null,
    ...overrides,
  };
}

describe("verifySignal honesty rules & chandelier trailing stop", () => {
  beforeEach(() => {
    setEngineConfig({ trailMode: "chandelier" });
  });

  it("1. Normal Stop-Loss breach: exits at stop level with status 'sl'", () => {
    const signal = makeSignal({ side: "buy", entry: 100, stopLoss: 90 });
    const candles: Candle[] = [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 101,
        high: 102,
        low: 99,
        close: 100,
        volume: 10,
      },
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 98,
        high: 99,
        low: 88,
        close: 89,
        volume: 10,
      },
    ];

    const verdict = verifySignal(signal, candles);
    expect(verdict.entryFilled).toBe(true);
    expect(verdict.status).toBe("sl");
    expect(verdict.exitPrice).toBe(90);
    expect(verdict.rMultiple).toBe(-1);
  });

  it("2. Gap-through Stop-Loss: candle opens beyond stop, exits at candle open", () => {
    const signal = makeSignal({ side: "buy", entry: 100, stopLoss: 90 });
    const candles: Candle[] = [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 101,
        high: 102,
        low: 99,
        close: 100,
        volume: 10,
      },
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 85,
        high: 88,
        low: 80,
        close: 82,
        volume: 10,
      }, // Gapped down to 85
    ];

    const verdict = verifySignal(signal, candles);
    expect(verdict.status).toBe("sl");
    expect(verdict.exitPrice).toBe(85);
    expect(verdict.rMultiple).toBe(-1.5);
  });

  it("3. Break-Even after TP1: stop moves to entry, closes at 0R if hit", () => {
    const signal = makeSignal({
      side: "buy",
      entry: 100,
      stopLoss: 90,
      tp1: 115,
    });
    const candles: Candle[] = [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 101,
        high: 102,
        low: 99,
        close: 100,
        volume: 10,
      },
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 100,
        high: 116,
        low: 100,
        close: 115,
        volume: 10,
      }, // TP1 hit!
      {
        openTime: new Date("2026-01-01T03:00:00Z").getTime(),
        open: 114,
        high: 114,
        low: 98,
        close: 99,
        volume: 10,
      }, // Reversal to entry
    ];

    const verdict = verifySignal(signal, candles);
    expect(verdict.status).toBe("be");
    expect(verdict.exitPrice).toBe(100);
    expect(verdict.rMultiple).toBe(0);
    expect(verdict.events.map(event => event.eventType)).toEqual([
      "ENTRY_FILLED",
      "TP1_HIT",
      "STOP_MOVED_BE",
      "CLOSED",
    ]);
    expect(new Set(verdict.events.map(event => event.eventKey)).size).toBe(
      verdict.events.length
    );
  });

  it("4. Chandelier Trail Breach after TP2: ratchets stop and closes with status 'tp2'", () => {
    setEngineConfig({ trailMode: "chandelier" });
    const signal = makeSignal({
      side: "buy",
      entry: 100,
      stopLoss: 90,
      tp1: 115,
      tp2: 125,
    });

    // Generate 15 candles before setup to initialize ATR series cleanly
    const prefix: Candle[] = [];
    const t0 = new Date("2025-12-31T00:00:00Z").getTime();
    for (let k = 0; k < 15; k++) {
      prefix.push({
        openTime: t0 + k * 3600_000,
        open: 100,
        high: 104,
        low: 96,
        close: 100,
        volume: 10,
      });
    }

    const tape: Candle[] = [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 101,
        high: 102,
        low: 99,
        close: 100,
        volume: 10,
      },
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 100,
        high: 116,
        low: 100,
        close: 115,
        volume: 10,
      }, // TP1
      {
        openTime: new Date("2026-01-01T03:00:00Z").getTime(),
        open: 115,
        high: 126,
        low: 115,
        close: 125,
        volume: 10,
      }, // TP2
      {
        openTime: new Date("2026-01-01T04:00:00Z").getTime(),
        open: 125,
        high: 139,
        low: 124,
        close: 138,
        volume: 10,
      }, // Push higher (below TP3 of 140)
      {
        openTime: new Date("2026-01-01T05:00:00Z").getTime(),
        open: 138,
        high: 138,
        low: 110,
        close: 112,
        volume: 10,
      }, // Reversal breaching trail
    ];

    const verdict = verifySignal(signal, [...prefix, ...tape]);
    expect(verdict.status).toBe("tp2");
    expect(verdict.rMultiple).toBeGreaterThan(1.5);
  });

  it("5. Gap-through limit entry fill: candle opens below Buy entry price and fills", () => {
    const signal = makeSignal({
      side: "buy",
      entry: 100,
      stopLoss: 90,
      tp1: 115,
    });
    const candles: Candle[] = [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 95,
        high: 98,
        low: 93,
        close: 95,
        volume: 10,
      }, // Gapped open to 95 (below 100 entry), low 93 (above 90 SL)
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 95,
        high: 116,
        low: 95,
        close: 115,
        volume: 10,
      }, // TP1 hit (moves stop to BE)
      {
        openTime: new Date("2026-01-01T03:00:00Z").getTime(),
        open: 114,
        high: 114,
        low: 98,
        close: 99,
        volume: 10,
      }, // Reversal to entry
    ];

    const verdict = verifySignal(signal, candles);
    expect(verdict.entryFilled).toBe(true);
    expect(verdict.status).toBe("be");
  });

  it("6. TP3 Reachability under chandelier mode: exits at TP3 with status 'tp3'", () => {
    setEngineConfig({ trailMode: "chandelier" });
    const signal = makeSignal({
      side: "buy",
      entry: 100,
      stopLoss: 90,
      tp1: 115,
      tp2: 125,
      tp3: 140,
    });
    const candles: Candle[] = [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 101,
        high: 102,
        low: 99,
        close: 100,
        volume: 10,
      },
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 100,
        high: 116,
        low: 100,
        close: 115,
        volume: 10,
      }, // TP1
      {
        openTime: new Date("2026-01-01T03:00:00Z").getTime(),
        open: 115,
        high: 126,
        low: 115,
        close: 125,
        volume: 10,
      }, // TP2
      {
        openTime: new Date("2026-01-01T04:00:00Z").getTime(),
        open: 125,
        high: 142,
        low: 124,
        close: 141,
        volume: 10,
      }, // Touches & exceeds TP3 (140)
    ];

    const verdict = verifySignal(signal, candles);
    expect(verdict.status).toBe("tp3");
    expect(verdict.exitPrice).toBe(140);
    expect(verdict.rMultiple).toBe(4.0);
  });

  it("expires before evaluating a candle that starts after the deadline", () => {
    const signal = makeSignal({
      entryFilled: true,
      expiresAt: new Date("2026-01-01T02:00:00Z"),
    });
    const candles: Candle[] = [
      {
        openTime: new Date("2026-01-01T03:00:00Z").getTime(),
        open: 120,
        high: 145,
        low: 110,
        close: 140,
        volume: 10,
      },
    ];

    const verdict = verifySignal(signal, candles);
    expect(verdict.status).toBe("expired");
    expect(verdict.exitPrice).toBeNull();
    expect(verdict.rMultiple).toBeNull();
  });

  it("reconstructs entry order instead of counting a pre-entry target", () => {
    const signal = makeSignal({
      entryFilled: true,
      expiresAt: new Date("2027-01-01T00:00:00Z"),
    });
    const candles: Candle[] = [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 120,
        high: 141,
        low: 110,
        close: 130,
        volume: 10,
      },
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 105,
        high: 106,
        low: 99,
        close: 101,
        volume: 10,
      },
    ];

    const verdict = verifySignal(signal, candles);
    expect(verdict.status).toBe("open");
    expect(verdict.entryFilled).toBe(true);
  });

  it("excludes the setup candle from entry and exit grading", () => {
    const signal = makeSignal({
      expiresAt: new Date("2027-01-01T00:00:00Z"),
    });
    const verdict = verifySignal(signal, [
      {
        openTime: signal.setupAt.getTime(),
        open: 100,
        high: 145,
        low: 85,
        close: 120,
        volume: 10,
      },
    ]);
    expect(verdict.status).toBe("open");
    expect(verdict.entryFilled).toBe(false);
    expect(verdict.events).toEqual([]);
  });

  it("uses stop-first grading when stop and target share the entry candle", () => {
    const verdict = verifySignal(makeSignal(), [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 100,
        high: 120,
        low: 89,
        close: 110,
        volume: 10,
      },
    ]);
    expect(verdict.status).toBe("sl");
    expect(verdict.exitPrice).toBe(90);
  });

  it("does not grade a candle that extends past the hard expiry boundary", () => {
    const signal = makeSignal({
      expiresAt: new Date("2026-01-01T01:30:00Z"),
    });
    const verdict = verifySignal(signal, [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 100,
        high: 145,
        low: 89,
        close: 140,
        volume: 10,
      },
    ]);
    expect(verdict.status).toBe("expired");
    expect(verdict.entryFilled).toBe(false);
  });

  it("applies sell-side gap stops and realized R symmetrically", () => {
    const signal = makeSignal({
      side: "sell",
      entry: 100,
      stopLoss: 110,
      tp1: 85,
      tp2: 75,
      tp3: 60,
    });
    const verdict = verifySignal(signal, [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 10,
      },
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 115,
        high: 118,
        low: 112,
        close: 116,
        volume: 10,
      },
    ]);
    expect(verdict.status).toBe("sl");
    expect(verdict.exitPrice).toBe(115);
    expect(verdict.rMultiple).toBe(-1.5);
  });

  it("returns deterministic replay events without duplicate event keys", () => {
    const signal = makeSignal();
    const candles: Candle[] = [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 100,
        high: 116,
        low: 99,
        close: 115,
        volume: 10,
      },
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 114,
        high: 114,
        low: 99,
        close: 100,
        volume: 10,
      },
    ];
    const first = verifySignal(signal, candles);
    const replay = verifySignal(signal, candles);
    expect(replay).toEqual(first);
    expect(new Set(first.events.map(event => event.eventKey)).size).toBe(
      first.events.length
    );
  });

  it("turns invalid geometry into a finite, deterministic undecidable result", () => {
    const signal = makeSignal({ stopLoss: 100 });
    const verdict = verifySignal(signal, []);
    expect(verdict.status).toBe("undecidable");
    expect(verdict.exitPrice).toBeNull();
    expect(verdict.rMultiple).toBeNull();
    expect(verdict.closedAt).toEqual(signal.setupAt);
  });

  it("marks missing candle coverage as deterministic undecidable", () => {
    const signal = makeSignal({
      entryFilled: true,
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    });
    const verdict = verifySignal(signal, []);
    expect(verdict.status).toBe("undecidable");
    expect(verdict.entryFilled).toBe(true);
    expect(verdict.closedAt).toEqual(
      getEffectiveSignalExpiry(
        signal.market,
        signal.timeframe,
        signal.openedAt,
        signal.expiresAt
      )
    );
    expect(verifySignal(signal, [])).toEqual(verdict);
  });

  it("moves a sell stop to break-even after TP1", () => {
    const signal = makeSignal({
      side: "sell",
      entry: 100,
      stopLoss: 110,
      tp1: 85,
      tp2: 75,
      tp3: 60,
    });
    const verdict = verifySignal(signal, [
      {
        openTime: new Date("2026-01-01T01:00:00Z").getTime(),
        open: 100,
        high: 101,
        low: 84,
        close: 85,
        volume: 10,
      },
      {
        openTime: new Date("2026-01-01T02:00:00Z").getTime(),
        open: 90,
        high: 101,
        low: 89,
        close: 100,
        volume: 10,
      },
    ]);
    expect(verdict.status).toBe("be");
    expect(verdict.exitPrice).toBe(100);
    expect(verdict.rMultiple).toBe(0);
  });
});
