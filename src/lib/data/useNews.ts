import { trpc } from "@/providers/trpc";
import type { NewsItem } from "@contracts/news";
import type { Market } from "@contracts/instruments";

export interface UseNewsOptions {
  symbol?: string | null;
  market?: Market | null;
  limit?: number | null;
}

export interface UseNewsResult {
  news: NewsItem[];
  isLoading: boolean;
  isError: boolean;
}

const NEWS_REFETCH_INTERVAL_MS = 60_000;
const NEWS_RETRY_COUNT = 2;

/**
 * Hook for consuming live market news headlines from the server RSS feed.
 * Inputs: optional filters for symbol, market category, and item limit.
 * Outputs: { news, isLoading, isError }.
 * Side effects: opens tRPC query with 60s auto-refresh.
 * Failure modes: isError true when fetch fails; returns empty news array.
 */
export function useNews(options?: UseNewsOptions): UseNewsResult {
  const query = trpc.news.list.useQuery(
    {
      symbol: options?.symbol ?? undefined,
      market: options?.market ?? undefined,
      limit: options?.limit ?? undefined,
    },
    {
      refetchInterval: NEWS_REFETCH_INTERVAL_MS,
      retry: NEWS_RETRY_COUNT,
    },
  );

  return {
    news: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
