import type { NewsItem } from "@contracts/news";
import type { NewsSource } from "./types";
import { AGGREGATOR_CACHE_TTL_MS, MAX_AGGREGATED_NEWS } from "./types";
import { dedupeNews } from "./dedupe";
import { RssNewsSource } from "./sources/rss";
import { CryptoPanicNewsSource } from "./sources/cryptopanic";
import { CryptoCompareNewsSource } from "./sources/cryptocompare";

export { dedupeNews, normalizeTitle, tokenizeTitle, jaccardSimilarity } from "./dedupe";
export { RssNewsSource, RSS_FEEDS, fetchNewsFeed, parseRssFeed, decodeXmlEntities, stripHtmlTags, truncateSummary, extractImageUrl } from "./sources/rss";
export { CryptoPanicNewsSource, mapCryptoPanicSymbols } from "./sources/cryptopanic";
export { CryptoCompareNewsSource } from "./sources/cryptocompare";
export * from "./types";

interface AggregatorCache {
  items: NewsItem[];
  fetchedAt: number;
}

let inMemoryAggregatorCache: AggregatorCache | null = null;

const rssSource = new RssNewsSource();
const cryptoPanicSource = new CryptoPanicNewsSource();
const cryptoCompareSource = new CryptoCompareNewsSource();

/**
 * Returns list of active news sources based on environment configuration.
 * Inputs: none.
 * Outputs: array of active NewsSource providers.
 * Side effects: reads process.env.
 * Failure modes: always returns at least the RSS provider.
 */
export function getActiveSources(): NewsSource[] {
  const sources: NewsSource[] = [rssSource];

  if (cryptoPanicSource.isEnabled()) {
    sources.push(cryptoPanicSource);
  }

  // CryptoCompare functions with public rate limits or with CRYPTOCOMPARE_API_KEY
  sources.push(cryptoCompareSource);

  return sources;
}

/**
 * Retrieves the latest market news headlines across all active aggregator sources.
 *
 * Pipeline:
 * 1. 15-minute in-memory aggregator caching with stale-cache fallback.
 * 2. Concurrent fetching with Promise.allSettled across enabled sources.
 * 3. Cross-source URL and title clustering deduplication via dedupeNews().
 * 4. Descending chronological sorting by publishedAt.
 * 5. Capped at 150 items.
 *
 * Inputs: forceRefresh optional boolean.
 * Outputs: Promise resolving to array of NewsItems (max 150).
 * Side effects: executes HTTP fetches to configured providers and updates in-memory cache.
 * Failure modes: returns stale cache on total source failures or empty array; never throws.
 */
export async function getNews(forceRefresh = false): Promise<NewsItem[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    inMemoryAggregatorCache &&
    now - inMemoryAggregatorCache.fetchedAt < AGGREGATOR_CACHE_TTL_MS
  ) {
    return inMemoryAggregatorCache.items;
  }

  const sources = getActiveSources();
  const settled = await Promise.allSettled(
    sources.map((source) => source.fetch(forceRefresh)),
  );

  const freshItems: NewsItem[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      freshItems.push(...result.value);
    }
  }

  if (freshItems.length > 0) {
    const deduped = dedupeNews(freshItems);
    deduped.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    const capped = deduped.slice(0, MAX_AGGREGATED_NEWS);
    inMemoryAggregatorCache = { items: capped, fetchedAt: now };
    return capped;
  }

  if (inMemoryAggregatorCache) {
    return inMemoryAggregatorCache.items;
  }

  return [];
}
