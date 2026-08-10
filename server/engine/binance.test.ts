import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllTickers, fetchKlines } from "./binance";

const klinePayload = [[1_700_000_000_000, "100", "110", "90", "105", "12"]];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Binance product routing", () => {
  it("routes crypto klines to USD-M Futures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(klinePayload), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchKlines("BTCUSDT", "1h", 300, "futures");

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT"
    );
  });

  it("keeps proxy klines on Binance Spot", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(klinePayload), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchKlines("PAXGUSDT", "4h", 300, "spot");

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT"
    );
  });

  it("can fetch a mixed futures/spot ticker tape", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const symbol = url.includes("BTCUSDT") ? "BTCUSDT" : "PAXGUSDT";
      return new Response(
        JSON.stringify({
          symbol,
          lastPrice: symbol === "BTCUSDT" ? "65000" : "2400",
          priceChangePercent: "1.5",
          volume: "100",
          quoteVolume: "100000",
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const tickers = await fetchAllTickers([
      { pair: "BTCUSDT", source: "futures" },
      { pair: "PAXGUSDT", source: "spot" },
    ]);

    expect(tickers.map(ticker => ticker.pair)).toEqual(["BTCUSDT", "PAXGUSDT"]);
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("fapi.binance.com/fapi/v1/ticker/24hr"),
        expect.stringContaining("data-api.binance.vision/api/v3/ticker/24hr"),
      ])
    );
  });
});
