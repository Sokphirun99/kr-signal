import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { matchSymbolsForText } from "@contracts/news";
import { getNews, fetchNewsFeed } from "./news";

describe("matchSymbolsForText", () => {
  it("matches Bitcoin correctly to BTCUSDT", () => {
    const symbols = matchSymbolsForText("Bitcoin rallies above key level");
    expect(symbols).toContain("BTCUSDT");
  });

  it("matches Ethereum correctly to ETHUSDT", () => {
    const symbols = matchSymbolsForText("Ethereum upgrade scheduled for next month");
    expect(symbols).toContain("ETHUSDT");
  });

  it("does not match 'method' as 'eth'", () => {
    const symbols = matchSymbolsForText("Method acting in new Hollywood movie");
    expect(symbols).not.toContain("ETHUSDT");
    expect(symbols).toEqual([]);
  });

  it("does not match 'Golden' as 'gold'", () => {
    const symbols = matchSymbolsForText("Golden ratio in classical art");
    expect(symbols).not.toContain("XAUUSD");
    expect(symbols).toEqual([]);
  });

  it("matches multiple symbols in a multi-asset headline", () => {
    const symbols = matchSymbolsForText("Bitcoin and Ethereum surge together");
    expect(symbols).toContain("BTCUSDT");
    expect(symbols).toContain("ETHUSDT");
  });

  it("matches forex and gold keywords with whole word accuracy", () => {
    expect(matchSymbolsForText("Central bank of england holds rates")).toContain("GBPUSD");
    expect(matchSymbolsForText("ECB policy update")).toContain("EURUSD");
    expect(matchSymbolsForText("Physical bullion demands rise")).toContain("XAUUSD");
  });
});

describe("server/engine/news adapter", () => {
  const mockRssXml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
    <channel>
      <title>Mock News Feed</title>
      <item>
        <title>Bitcoin Hits New Milestone</title>
        <link>https://example.com/btc-news-1</link>
        <pubDate>Fri, 08 Aug 2026 01:00:00 GMT</pubDate>
        <description><![CDATA[<p>Bitcoin trading volume increased significantly today.</p>]]></description>
        <media:thumbnail url="https://example.com/btc-thumb.jpg" />
      </item>
      <item>
        <title>Ethereum Developers Announce Schedule</title>
        <link>https://example.com/eth-news-2</link>
        <pubDate>Fri, 08 Aug 2026 00:30:00 GMT</pubDate>
        <description>Ethereum network activity continues to grow steadily across protocols.</description>
        <enclosure url="https://example.com/eth-cover.png" type="image/png" />
      </item>
    </channel>
  </rss>`;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses RSS XML feed correctly and computes matched symbols", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockRssXml,
    });
    vi.stubGlobal("fetch", mockFetch);

    const items = await fetchNewsFeed("https://example.com/feed", "MockSource");
    expect(items.length).toBe(2);
    expect(items[0].title).toBe("Bitcoin Hits New Milestone");
    expect(items[0].source).toBe("MockSource");
    expect(items[0].matchedSymbols).toContain("BTCUSDT");
    expect(items[0].summary).toBe("Bitcoin trading volume increased significantly today.");
    expect(items[0].imageUrl).toBe("https://example.com/btc-thumb.jpg");
    expect(items[1].matchedSymbols).toContain("ETHUSDT");
    expect(items[1].imageUrl).toBe("https://example.com/eth-cover.png");
  });

  it("continues gracefully when one feed fails in getNews", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("coindesk")) {
        return Promise.resolve({
          ok: true,
          text: async () => mockRssXml,
        });
      }
      return Promise.reject(new Error("Network connection timeout"));
    });
    vi.stubGlobal("fetch", mockFetch);

    const news = await getNews(true); // force fresh fetch
    expect(news.length).toBeGreaterThan(0);
    expect(news.some((item) => item.title.includes("Bitcoin"))).toBe(true);
  });

  it("serves stale cache on total network failure after cache is warm", async () => {
    // 1. Warm cache
    const mockFetchSuccess = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockRssXml,
    });
    vi.stubGlobal("fetch", mockFetchSuccess);
    const initialNews = await getNews(true);
    expect(initialNews.length).toBeGreaterThan(0);

    // 2. Simulate total network outage
    const mockFetchFail = vi.fn().mockRejectedValue(new Error("DNS lookup failed"));
    vi.stubGlobal("fetch", mockFetchFail);

    const fallbackNews = await getNews(true);
    expect(fallbackNews.length).toBe(initialNews.length);
    expect(fallbackNews[0].title).toBe(initialNews[0].title);
  });
});
