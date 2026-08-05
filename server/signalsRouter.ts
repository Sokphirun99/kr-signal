import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { ensureFresh } from "./engine/pipeline";
import { listSignals, computeTrackRecord, computeFunnel } from "./queries/signals";
import { fetchAllTickers } from "./engine/binance";
import { INSTRUMENTS } from "@contracts/instruments";

export const signalsRouter = createRouter({
  /** Signal feed — triggers a throttled pipeline pass first */
  list: publicQuery
    .input(
      z
        .object({
          symbol: z.string().optional(),
          status: z
            .enum(["open", "tp1", "tp2", "tp3", "sl", "be", "expired", "undecidable"])
            .optional(),
          closedOnly: z.boolean().optional(),
          limit: z.number().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      await ensureFresh().catch((err) => console.error("ensureFresh error:", err));
      return listSignals(input ?? {});
    }),

  /** Verified track record — computed only from market-graded outcomes */
  trackRecord: publicQuery.query(async () => {
    await ensureFresh().catch((err) => console.error("ensureFresh error:", err));
    return computeTrackRecord();
  }),

  /** Audit funnel: scanned → candidate → published over the last 7 days */
  funnel: publicQuery.query(async () => {
    await ensureFresh().catch((err) => console.error("ensureFresh error:", err));
    return computeFunnel(7);
  }),

  /** Live ticker tape across all instruments */
  ticker: publicQuery.query(async () => {
    try {
      const tickers = await fetchAllTickers(INSTRUMENTS.map((i) => i.pair));
      return INSTRUMENTS.map((inst) => {
        const t = tickers.find((x) => x.pair === inst.pair);
        return {
          symbol: inst.symbol,
          name: inst.name,
          market: inst.market,
          decimals: inst.decimals,
          basisNote: inst.basisNote ?? null,
          lastPrice: t?.lastPrice ?? null,
          priceChangePct: t?.priceChangePct ?? null,
          quoteVolume: t?.quoteVolume ?? null,
        };
      });
    } catch {
      return INSTRUMENTS.map((inst) => ({
        symbol: inst.symbol,
        name: inst.name,
        market: inst.market,
        decimals: inst.decimals,
        basisNote: inst.basisNote ?? null,
        lastPrice: null,
        priceChangePct: null,
        quoteVolume: null,
      }));
    }
  }),
});
