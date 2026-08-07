import { describe, it, expect, vi } from "vitest";
import { appRouter } from "../router";
import * as newsEngine from "../engine/news";
import type { NewsItem } from "@contracts/news";

describe("newsRouter", () => {
  const mockNews: NewsItem[] = [
    {
      id: "https://example.com/1",
      title: "Bitcoin breaks resistance",
      url: "https://example.com/1",
      source: "CoinDesk",
      publishedAt: "2026-08-08T00:00:00.000Z",
      summary: "BTC continues upward trend.",
      matchedSymbols: ["BTCUSDT"],
    },
    {
      id: "https://example.com/2",
      title: "Gold prices stabilize amid forex moves",
      url: "https://example.com/2",
      source: "Decrypt",
      publishedAt: "2026-08-07T23:00:00.000Z",
      summary: "Bullion demand increases.",
      matchedSymbols: ["XAUUSD"],
    },
    {
      id: "https://example.com/3",
      title: "Macro economic overview",
      url: "https://example.com/3",
      source: "Cointelegraph",
      publishedAt: "2026-08-07T22:00:00.000Z",
      summary: "Broad markets summary without symbol mentions.",
      matchedSymbols: [],
    },
  ];

  const mockContext = { req: {} as Request, resHeaders: new Headers() };

  it("returns all news on general feed without filters", async () => {
    vi.spyOn(newsEngine, "getNews").mockResolvedValue(mockNews);
    const caller = appRouter.createCaller(mockContext);
    const result = await caller.news.list({});
    expect(result.length).toBe(3);
  });

  it("filters by specific symbol", async () => {
    vi.spyOn(newsEngine, "getNews").mockResolvedValue(mockNews);
    const caller = appRouter.createCaller(mockContext);
    const result = await caller.news.list({ symbol: "BTCUSDT" });
    expect(result.length).toBe(1);
    expect(result[0].matchedSymbols).toContain("BTCUSDT");
  });

  it("filters by market category", async () => {
    vi.spyOn(newsEngine, "getNews").mockResolvedValue(mockNews);
    const caller = appRouter.createCaller(mockContext);
    const result = await caller.news.list({ market: "gold" });
    expect(result.length).toBe(1);
    expect(result[0].matchedSymbols).toContain("XAUUSD");
  });
});
