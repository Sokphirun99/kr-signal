import { matchSymbolsForText, type NewsItem } from "@contracts/news";
import type { NewsSource } from "../types";
import { FEED_TIMEOUT_MS, SOURCE_CACHE_TTL_MS, MAX_SUMMARY_LENGTH } from "../types";
import { stripHtmlTags, truncateSummary } from "./rss";

interface CryptoCompareArticle {
  id: string;
  guid?: string;
  published_on: number;
  imageurl?: string;
  title: string;
  url: string;
  source?: string;
  body?: string;
  tags?: string;
  categories?: string;
  source_info?: {
    name?: string;
    lang?: string;
    img?: string;
  };
}

interface CryptoCompareResponse {
  Data?: CryptoCompareArticle[];
}

/**
 * NewsSource implementation for the CryptoCompare v2 News API.
 */
export class CryptoCompareNewsSource implements NewsSource {
  public readonly name = "CryptoCompare";
  private cache: { items: NewsItem[]; fetchedAt: number } | null = null;

  /**
   * Fetches latest market news articles from CryptoCompare with 30-min per-source caching.
   * Inputs: forceRefresh optional boolean.
   * Outputs: Promise resolving to array of NewsItems.
   * Side effects: performs HTTP GET to cryptocompare.com API.
   * Failure modes: returns empty array on network failure; serves stale cache.
   */
  async fetch(forceRefresh = false): Promise<NewsItem[]> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cache &&
      now - this.cache.fetchedAt < SOURCE_CACHE_TTL_MS
    ) {
      return this.cache.items;
    }

    const apiKey = process.env.CRYPTOCOMPARE_API_KEY?.trim();
    let url = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
    if (apiKey) {
      url += `&api_key=${encodeURIComponent(apiKey)}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`CryptoCompare API returned HTTP ${response.status}`);
      }

      const json = (await response.json()) as CryptoCompareResponse;
      const articles = json.Data ?? [];

      const items: NewsItem[] = articles
        .filter((article) => Boolean(article.title && (article.url || article.guid)))
        .map((article) => {
          const title = article.title.trim();
          const targetUrl = (article.url || article.guid || "").trim();
          const sourceName =
            article.source_info?.name || article.source || "CryptoCompare";

          const publishedMs =
            typeof article.published_on === "number" && article.published_on > 0
              ? article.published_on * 1000
              : now;
          const publishedAt = new Date(publishedMs).toISOString();

          const rawBody = article.body ? stripHtmlTags(article.body) : "";
          const summary = truncateSummary(rawBody, MAX_SUMMARY_LENGTH);
          const imageUrl = article.imageurl ? article.imageurl.trim() : null;

          const matchInput = `${title} ${rawBody.slice(0, 300)} ${
            article.categories ?? ""
          } ${article.tags ?? ""}`;
          const matchedSymbols = matchSymbolsForText(matchInput);

          return {
            id: targetUrl,
            title,
            url: targetUrl,
            source: sourceName,
            sources: [sourceName],
            publishedAt,
            summary,
            imageUrl,
            matchedSymbols,
          };
        });

      if (items.length > 0) {
        this.cache = { items, fetchedAt: now };
        return items;
      }
    } catch {
      // Handled below with stale cache fallback
    } finally {
      clearTimeout(timer);
    }

    if (this.cache) {
      return this.cache.items;
    }

    return [];
  }
}
