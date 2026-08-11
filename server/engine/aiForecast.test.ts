import { afterEach, describe, expect, it, vi } from "vitest";
import type { Candle } from "./binance";
import {
  AI_FORECAST_CONTEXT_CANDLES,
  getAiForecast,
  requestAiForecast,
} from "./aiForecast";

afterEach(() => vi.unstubAllEnvs());

function candles(): Candle[] {
  return Array.from({ length: AI_FORECAST_CONTEXT_CANDLES }, (_, index) => ({
    openTime: 1_700_000_000_000 + index * 900_000,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1_000 + index,
  }));
}

function snapshot() {
  return {
    source: "hugging-face-space",
    model: "ibm-granite/granite-timeseries-ttm-r2",
    modelRevision: "512-48-ft-r2.1",
    symbol: "BTCUSDT",
    timeframe: "15m",
    direction: "bullish",
    lastClose: 611.5,
    forecastPrice: 620,
    expectedChangePct: 1.39,
    rangeLow: 612,
    rangeHigh: 621,
    horizonCandles: 16,
    pathAgreement: 0.75,
    noiseThresholdPct: 0.1,
    observedAt: "2026-08-11T00:00:00.000Z",
    generatedAt: "2026-08-11T00:01:00.000Z",
    disclaimer:
      "Experimental shadow forecast; it does not publish, veto, size, or execute trades.",
  };
}

describe("Hugging Face AI forecast client", () => {
  it("queues a forecast and validates the completed SSE result", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ event_id: "event-1" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          `event: complete\ndata: ${JSON.stringify([snapshot()])}\n\n`,
          {
            status: 200,
          }
        )
      );

    const result = await requestAiForecast(
      { symbol: "BTCUSDT", timeframe: "15m", candles: candles() },
      {
        fetchImpl,
        sharedSecret: "test-shared-secret",
        spaceUrl: "https://example.hf.space",
        timeoutMs: 1_000,
      }
    );

    expect(result.direction).toBe("bullish");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const queuedBody = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(queuedBody.data[0].authToken).toBe("test-shared-secret");
    expect(queuedBody.data[0].candles).toHaveLength(512);
  });

  it("rejects malformed model output", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ event_id: "event-2" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response('event: complete\ndata: [{"direction":"bullish"}]\n\n', {
          status: 200,
        })
      );

    await expect(
      requestAiForecast(
        { symbol: "BTCUSDT", timeframe: "15m", candles: candles() },
        {
          fetchImpl,
          sharedSecret: "test-shared-secret",
          spaceUrl: "https://example.hf.space",
        }
      )
    ).rejects.toThrow("invalid forecast");
  });

  it("returns null when the optional Space is unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("space sleeping"));
    await expect(
      getAiForecast(
        { symbol: "BTCUSDT", timeframe: "15m", candles: candles() },
        { fetchImpl, spaceUrl: "https://example.hf.space" }
      )
    ).resolves.toBeNull();
  });

  it("does not call the Space when forecasts are disabled", async () => {
    vi.stubEnv("HF_AI_FORECASTS", "off");
    const fetchImpl = vi.fn();

    await expect(
      getAiForecast(
        { symbol: "BTCUSDT", timeframe: "15m", candles: candles() },
        { fetchImpl, spaceUrl: "https://example.hf.space" }
      )
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("forwards an already-aborted pipeline signal", async () => {
    const parent = new AbortController();
    parent.abort(new Error("pipeline stopped"));
    const fetchImpl = vi.fn((_input, init) => {
      expect(init?.signal?.aborted).toBe(true);
      return Promise.reject(init?.signal?.reason);
    });

    await expect(
      requestAiForecast(
        { symbol: "BTCUSDT", timeframe: "15m", candles: candles() },
        {
          fetchImpl,
          sharedSecret: "test-shared-secret",
          signal: parent.signal,
          spaceUrl: "https://example.hf.space",
        }
      )
    ).rejects.toThrow("pipeline stopped");
  });
});
