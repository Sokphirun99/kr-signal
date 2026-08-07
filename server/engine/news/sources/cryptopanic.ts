import { matchSymbolsForText, type NewsItem } from "@contracts/news";
import { parseUtcDate } from "@contracts/instruments";
import type { NewsSource } from "../types";
import { FEED_TIMEOUT_MS, SOURCE_CACHE_TTL_MS } from "../types";

const CURRENCY_TO_SYMBOL_MAP: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  PAXG: "XAUUSD",
  XAU: "XAUUSD",
  GOLD: "XAUUSD",
  EUR: "EURUSD",
  GBP: "GBPUSD",
};

interface CryptoPanicPost {
  id: number;
  title: string;
  url: string;
  domain?: string;
  source?: {
    title?: string;
    domain?: string;
  };
  published_at: string;
  currencies?: Array<{
    code: string;
    title: string;
    slug: string;
  }>;
}

interface CryptoPanicResponse {
  results?: CryptoPanicPost[];
}

/**
 * Maps CryptoPanic currency tags or falls back to text keyword matching.
 * Inputs: post object with currencies and title.
 * Outputs: array of matched canonical symbols.
 * Side effects: none.
 * Failure modes: returns empty array on empty inputs.
 */
export function mapCryptoPanicSymbols(post: {
  currencies?: Array<{ code: string }>;
  title: string;
}): string[] {
  const matchedSet = new Set<string>();

  if (post.currencies && post.currencies.length > 0) {
    for (const curr of post.currencies) {
      const code = (curr.code ?? "").toUpperCase().trim();
      const mapped = CURRENCY_TO_SYMBOL_MAP[code];
      if (mapped) {
        matchedSet.add(mapped);
      }
    }
  }

  // Fallback to text matching if no tagged currency codes matched our registry
  if (matchedSet.size === 0 && post.title) {
    const textMatches = matchSymbolsForText(post.title);
    for (const sym of textMatches) {
      matchedSet.add(sym);
    }
  }

  return Array.from(matchedSet);
}

/**
 * NewsSource implementation for the CryptoPanic Developer API.
 */
export class CryptoPanicNewsSource implements NewsSource {
  public readonly name = "CryptoPanic";
  private cache: { items: NewsItem[]; fetchedAt: number } | null = null;

  /**
   * Returns whether the CryptoPanic provider has an active API key configured.
   */
  isEnabled(): boolean {
    const key = process.env.CRYPTOPANIC_API_KEY;
    return Boolean(key && key.trim().length > 0);
  }

  /**
   * Fetches latest posts from CryptoPanic with 30-min per-source caching.
   * Inputs: forceRefresh optional boolean.
   * Outputs: Promise resolving to array of NewsItems.
   * Side effects: performs HTTP GET to cryptopanic.com.
   * Failure modes: returns empty array when unconfigured or failing; serves stale cache.
   */
  async fetch(forceRefresh = false): Promise<NewsItem[]> {
    const apiKey = process.env.CRYPTOPANIC_API_KEY?.trim();
    if (!apiKey) {
      return [];
    }

    const now = Date.now();
    if (
      !forceRefresh &&
      this.cache &&
      now - this.cache.fetchedAt < SOURCE_CACHE_TTL_MS
    ) {
      return this.cache.items;
    }

    const url = `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${encodeURIComponent(
      apiKey,
    )}&filter=hot&public=true`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`CryptoPanic API returned HTTP ${response.status}`);
      }

      const json = (await response.json()) as CryptoPanicResponse;
      const posts = json.results ?? [];

      const items: NewsItem[] = posts
        .filter((post) => Boolean(post.title && post.url))
        .map((post) => {
          const sourceName =
            post.domain ||
            post.source?.domain ||
            post.source?.title ||
            "CryptoPanic";
          const publishedAt = parseUtcDate(post.published_at).toISOString();
          const matchedSymbols = mapCryptoPanicSymbols(post);

          return {
            id: post.url,
            title: post.title.trim(),
            url: post.url.trim(),
            source: sourceName,
            sources: [sourceName],
            publishedAt,
            summary: null,
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
