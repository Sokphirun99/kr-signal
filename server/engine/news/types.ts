import type { NewsItem } from "@contracts/news";

/**
 * Common contract for all market news providers.
 */
export interface NewsSource {
  /** Identifier name for the provider, e.g. "RSS Feeds", "CryptoPanic", "CryptoCompare" */
  readonly name: string;
  /**
   * Fetches latest news headlines from the provider.
   * Inputs: optional forceRefresh boolean.
   * Outputs: Promise resolving to array of standardized NewsItem objects.
   * Side effects: performs HTTP requests.
   * Failure modes: rejects on network or parsing errors.
   */
  fetch(forceRefresh?: boolean): Promise<NewsItem[]>;
}

export const FEED_TIMEOUT_MS = 10_000;
export const AGGREGATOR_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const SOURCE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_AGGREGATED_NEWS = 150;
export const MAX_SUMMARY_LENGTH = 240;
export const MAX_RSS_RESPONSE_BYTES = 1024 * 1024;
export const MAX_RSS_ITEMS_PER_FEED = 100;
