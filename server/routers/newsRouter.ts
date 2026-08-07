import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getNews } from "../engine/news";
import { INSTRUMENTS, type Market } from "@contracts/instruments";

const MAX_NEWS_LIMIT = 100;
const DEFAULT_NEWS_LIMIT = 60;

/**
 * Derives instrument symbols belonging to a specific market category.
 * Inputs: market category string.
 * Outputs: Set of symbol strings.
 * Side effects: none.
 * Failure modes: returns empty set for unknown market.
 */
function getSymbolsForMarket(market: Market): Set<string> {
  const symbols = INSTRUMENTS.filter((i) => i.market === market).map((i) => i.symbol);
  return new Set(symbols);
}

export const newsRouter = createRouter({
  /**
   * News headlines feed with optional symbol and market category filtering.
   * Returns unmatched items only when no filter is applied.
   */
  list: publicQuery
    .input(
      z
        .object({
          symbol: z.string().nullish(),
          market: z.enum(["crypto", "gold", "forex"]).nullish(),
          limit: z.number().min(1).max(MAX_NEWS_LIMIT).nullish(),
        })
        .nullish(),
    )
    .query(async ({ input }) => {
      const allNews = await getNews();
      const symbolFilter = input?.symbol?.trim();
      const marketFilter = input?.market ?? null;
      const limit = input?.limit ?? DEFAULT_NEWS_LIMIT;

      let filtered = allNews;

      if (symbolFilter) {
        filtered = filtered.filter((item) => item.matchedSymbols.includes(symbolFilter));
      } else if (marketFilter) {
        const marketSymbols = getSymbolsForMarket(marketFilter);
        filtered = filtered.filter((item) =>
          item.matchedSymbols.some((sym) => marketSymbols.has(sym)),
        );
      }

      return filtered.slice(0, Math.min(limit, MAX_NEWS_LIMIT));
    }),
});
