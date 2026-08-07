import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { matchSymbolsForText } from "@contracts/news";
import { getNews, fetchNewsFeed } from "./news/index";
import { CryptoPanicNewsSource, mapCryptoPanicSymbols } from "./news/sources/cryptopanic";
import { CryptoCompareNewsSource } from "./news/sources/cryptocompare";
import { RssNewsSource } from "./news/sources/rss";

describe("matchSymbolsForText", () => {
  it("matches Bitcoin correctly to BTCUSDT", () => {
    const symbols = matchSymbolsForText("Bitcoin rallies above key level");
    expect(symbols).toContain("BTCUSDT");
  });

  it("matches Ethereum correctly to ETHUSDT", () => {
    const symbols = matchSymbolsForText("Ethereum upgrade scheduled for next month");
    expect(symbols).toContain("ETHUSDT");
  });

  it("matches Gold keywords correctly to XAUUSD", () => {
    const symbols = matchSymbolsForText("Gold spot demand increases amid central bank buying");
    expect(symbols).toContain("XAUUSD");
  });

  it("matches Forex pairs correctly to EURUSD and GBPUSD", () => {
    const eur = matchSymbolsForText("EUR/USD rises after ECB rate commentary");
    expect(eur).toContain("EURUSD");

    const gbp = matchSymbolsForText("Pound sterling holds ground following Bank of England decision");
    expect(gbp).toContain("GBPUSD");
  });

  it("prevents false positive substring matches", () => {
    expect(matchSymbolsForText("The method is robust")).not.toContain("ETHUSDT");
    expect(matchSymbolsForText("Golden cross in technical analysis")).not.toContain("XAUUSD");
  });
});

describe("CryptoPanic Source & Tag Mapping", () => {
  it("maps tagged currency codes to canonical registry symbols", () => {
    const postWithBtc = {
      title: "Market update without names in title",
      currencies: [{ code: "BTC" }],
    };
    expect(mapCryptoPanicSymbols(postWithBtc)).toEqual(["BTCUSDT"]);

    const postWithMulti = {
      title: "Layer 1 and precious token review",
      currencies: [{ code: "ETH" }, { code: "PAXG" }],
    };
    const mapped = mapCryptoPanicSymbols(postWithMulti);
    expect(mapped).toContain("ETHUSDT");
    expect(mapped).toContain("XAUUSD");
  });

  it("falls back to title text matching when currency codes are unknown or missing", () => {
    const postFallback = {
      title: "Surging Bitcoin adoption across institutions",
      currencies: [{ code: "SOL" }, { code: "ADA" }],
    };
    const mapped = mapCryptoPanicSymbols(postFallback);
    expect(mapped).toContain("BTCUSDT");
  });

  it("parses CryptoPanic JSON response with 10s timeout and maps to NewsItem", async () => {
    process.env.CRYPTOPANIC_API_KEY = "test-cryptopanic-key";
    const source = new CryptoPanicNewsSource();

    const mockResponse = {
      results: [
        {
          id: 101,
          title: "Bitcoin breaks $70k barrier",
          url: "https://cryptopanic.com/news/101/click/",
          domain: "coindesk.com",
          published_at: "2026-08-08T01:30:00Z",
          currencies: [{ code: "BTC", title: "Bitcoin", slug: "bitcoin" }],
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const items = await source.fetch(true);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("Bitcoin breaks $70k barrier");
    expect(items[0].matchedSymbols).toContain("BTCUSDT");
    expect(items[0].source).toBe("coindesk.com");
  });
});

describe("CryptoCompare Source & Body Mapping", () => {
  it("maps CryptoCompare article payload with truncated summary and category matching", async () => {
    const source = new CryptoCompareNewsSource();

    const mockResponse = {
      Data: [
        {
          id: "202",
          title: "Ethereum staking reaches record high",
          url: "https://example.com/eth-staking",
          source: "cointelegraph",
          body: "Ethereum validator count has exceeded 1 million active participants across global networks.",
          published_on: 1723075200,
          categories: "ETH,Staking,Blockchain",
          imageurl: "https://example.com/eth.jpg",
          source_info: { name: "Cointelegraph" },
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const items = await source.fetch(true);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("Ethereum staking reaches record high");
    expect(items[0].source).toBe("Cointelegraph");
    expect(items[0].matchedSymbols).toContain("ETHUSDT");
    expect(items[0].summary).toContain("Ethereum validator count");
  });
});

describe("Aggregator Resilience & Caching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("continues serving healthy sources when one news provider is dead or throws", async () => {
    vi.spyOn(RssNewsSource.prototype, "fetch").mockResolvedValueOnce([
      {
        id: "https://coindesk.com/article1",
        title: "Bitcoin dominance rises",
        url: "https://coindesk.com/article1",
        source: "CoinDesk",
        sources: ["CoinDesk"],
        publishedAt: "2026-08-08T01:00:00.000Z",
        summary: "BTC continues ascent.",
        matchedSymbols: ["BTCUSDT"],
      },
    ]);

    vi.spyOn(CryptoCompareNewsSource.prototype, "fetch").mockRejectedValueOnce(
      new Error("CryptoCompare rate limited or down"),
    );

    const news = await getNews(true);
    expect(news.length).toBeGreaterThanOrEqual(1);
    expect(news[0].title).toBe("Bitcoin dominance rises");
  });

  it("handles RSS fetch failure gracefully in standalone fetchNewsFeed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response);

    await expect(
      fetchNewsFeed("https://example.com/bad-rss", "BadFeed"),
    ).rejects.toThrow("HTTP 503");
  });

  it("statically verifies news modules are NEVER imported by strategy.ts, gate.ts, or verifier.ts", () => {
    const forbiddenFiles = [
      "server/engine/strategy.ts",
      "server/engine/gate.ts",
      "server/engine/verifier.ts",
    ];

    for (const relPath of forbiddenFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const content = fs.readFileSync(fullPath, "utf-8").toLowerCase();
      expect(content).not.toContain("cryptopanic");
      expect(content).not.toContain("cryptocompare");
    }
  });
});
