import { describe, it, expect } from "vitest";
import { dedupeNews, normalizeTitle, jaccardSimilarity, tokenizeTitle } from "./dedupe";
import type { NewsItem } from "@contracts/news";

describe("News Deduplication & Title Clustering Engine", () => {
  it("normalizes titles and computes Jaccard similarity accurately", () => {
    const normA = normalizeTitle("Bitcoin ETF sees record inflows!");
    const normB = normalizeTitle("bitcoin etf sees record inflows");
    expect(normA).toBe("bitcoin etf sees record inflows");
    expect(normB).toBe("bitcoin etf sees record inflows");

    const tokensA = tokenizeTitle(normA);
    const tokensB = tokenizeTitle(normB);
    const sim = jaccardSimilarity(tokensA, tokensB);
    expect(sim).toBe(1.0);
  });

  it("merges the same story via CoinDesk + CryptoPanic into ONE item with unioned sources and earliest date", () => {
    const itemCoinDesk: NewsItem = {
      id: "https://coindesk.com/markets/bitcoin-etf-inflows",
      title: "Bitcoin ETF sees record inflows",
      url: "https://coindesk.com/markets/bitcoin-etf-inflows",
      source: "CoinDesk",
      sources: ["CoinDesk"],
      publishedAt: "2026-08-08T01:00:00.000Z",
      summary: "Short summary.",
      matchedSymbols: ["BTCUSDT"],
    };

    const itemCryptoPanic: NewsItem = {
      id: "https://cryptopanic.com/news/999/click/",
      title: "Bitcoin ETF Sees Record Inflows!",
      url: "https://cryptopanic.com/news/999/click/",
      source: "CryptoPanic",
      sources: ["CryptoPanic"],
      publishedAt: "2026-08-08T01:30:00.000Z",
      summary: "A much longer and more detailed summary of ETF inflows across issuers.",
      matchedSymbols: ["BTCUSDT"],
    };

    const deduped = dedupeNews([itemCryptoPanic, itemCoinDesk]);
    expect(deduped.length).toBe(1);

    const merged = deduped[0];
    expect(merged.sources).toContain("CoinDesk");
    expect(merged.sources).toContain("CryptoPanic");
    expect(merged.publishedAt).toBe("2026-08-08T01:00:00.000Z");
    expect(merged.summary).toBe("A much longer and more detailed summary of ETF inflows across issuers.");
    expect(merged.matchedSymbols).toContain("BTCUSDT");
  });

  it("does not merge stories with Jaccard similarity < 0.6", () => {
    const item1: NewsItem = {
      id: "https://example.com/1",
      title: "Bitcoin miners rally after halving",
      url: "https://example.com/1",
      source: "CoinDesk",
      publishedAt: "2026-08-08T01:00:00.000Z",
      summary: null,
      matchedSymbols: ["BTCUSDT"],
    };

    const item2: NewsItem = {
      id: "https://example.com/2",
      title: "Bitcoin price rallies past resistance",
      url: "https://example.com/2",
      source: "Cointelegraph",
      publishedAt: "2026-08-08T01:05:00.000Z",
      summary: null,
      matchedSymbols: ["BTCUSDT"],
    };

    const deduped = dedupeNews([item1, item2]);
    expect(deduped.length).toBe(2);
  });

  it("handles empty input and single-source items gracefully", () => {
    expect(dedupeNews([])).toEqual([]);

    const single: NewsItem = {
      id: "https://example.com/single",
      title: "Ethereum staking reaches milestone",
      url: "https://example.com/single",
      source: "Decrypt",
      publishedAt: "2026-08-08T00:00:00.000Z",
      summary: "Staking metrics update.",
      matchedSymbols: ["ETHUSDT"],
    };

    const result = dedupeNews([single]);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Ethereum staking reaches milestone");
    expect(result[0].sources).toEqual(["Decrypt"]);
  });

  it("does not merge articles with identical titles if published more than 48 hours apart", () => {
    const itemOld: NewsItem = {
      id: "https://example.com/old",
      title: "Federal Reserve interest rate decision announcement",
      url: "https://example.com/old",
      source: "CoinDesk",
      publishedAt: "2026-08-01T12:00:00.000Z",
      summary: null,
      matchedSymbols: ["EURUSD"],
    };

    const itemNew: NewsItem = {
      id: "https://example.com/new",
      title: "Federal Reserve interest rate decision announcement",
      url: "https://example.com/new",
      source: "Decrypt",
      publishedAt: "2026-08-06T12:00:00.000Z", // > 48h apart
      summary: null,
      matchedSymbols: ["EURUSD"],
    };

    const deduped = dedupeNews([itemOld, itemNew]);
    expect(deduped.length).toBe(2);
  });
});
