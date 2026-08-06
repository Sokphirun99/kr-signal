import { describe, it, expect, beforeEach } from "vitest";
import { verifySignal, setTrailMode } from "./verifier";
import type { Signal } from "@db/schema";
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
    setTrailMode("chandelier");
  });

  it("1. Normal Stop-Loss breach: exits at stop level with status 'sl'", () => {
    const signal = makeSignal({ side: "buy", entry: 100, stopLoss: 90 });
    const candles: Candle[] = [
      { openTime: new Date("2026-01-01T01:00:00Z").getTime(), open: 101, high: 102, low: 99, close: 100, volume: 10 },
      { openTime: new Date("2026-01-01T02:00:00Z").getTime(), open: 98, high: 99, low: 88, close: 89, volume: 10 },
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
      { openTime: new Date("2026-01-01T01:00:00Z").getTime(), open: 101, high: 102, low: 99, close: 100, volume: 10 },
      { openTime: new Date("2026-01-01T02:00:00Z").getTime(), open: 85, high: 88, low: 80, close: 82, volume: 10 }, // Gapped down to 85
    ];

    const verdict = verifySignal(signal, candles);
    expect(verdict.status).toBe("sl");
    expect(verdict.exitPrice).toBe(85);
    expect(verdict.rMultiple).toBe(-1.5);
  });

  it("3. Break-Even after TP1: stop moves to entry, closes at 0R if hit", () => {
    const signal = makeSignal({ side: "buy", entry: 100, stopLoss: 90, tp1: 115 });
    const candles: Candle[] = [
      { openTime: new Date("2026-01-01T01:00:00Z").getTime(), open: 101, high: 102, low: 99, close: 100, volume: 10 },
      { openTime: new Date("2026-01-01T02:00:00Z").getTime(), open: 100, high: 116, low: 100, close: 115, volume: 10 }, // TP1 hit!
      { openTime: new Date("2026-01-01T03:00:00Z").getTime(), open: 114, high: 114, low: 98, close: 99, volume: 10 }, // Reversal to entry
    ];

    const verdict = verifySignal(signal, candles);
    expect(verdict.status).toBe("be");
    expect(verdict.exitPrice).toBe(100);
    expect(verdict.rMultiple).toBe(0);
  });

  it("4. Chandelier Trail Breach after TP2: ratchets stop and closes with status 'tp2'", () => {
    setTrailMode("chandelier");
    const signal = makeSignal({ side: "buy", entry: 100, stopLoss: 90, tp1: 115, tp2: 125 });

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
      { openTime: new Date("2026-01-01T01:00:00Z").getTime(), open: 101, high: 102, low: 99, close: 100, volume: 10 },
      { openTime: new Date("2026-01-01T02:00:00Z").getTime(), open: 100, high: 116, low: 100, close: 115, volume: 10 }, // TP1
      { openTime: new Date("2026-01-01T03:00:00Z").getTime(), open: 115, high: 126, low: 115, close: 125, volume: 10 }, // TP2
      { openTime: new Date("2026-01-01T04:00:00Z").getTime(), open: 125, high: 140, low: 124, close: 138, volume: 10 }, // Push higher
      { openTime: new Date("2026-01-01T05:00:00Z").getTime(), open: 138, high: 138, low: 110, close: 112, volume: 10 }, // Reversal breaching trail
    ];

    const verdict = verifySignal(signal, [...prefix, ...tape]);
    expect(verdict.status).toBe("tp2");
    expect(verdict.rMultiple).toBeGreaterThan(1.5);
  });
});
