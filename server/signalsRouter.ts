import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { ensureFresh } from "./engine/pipeline";
import { listSignals, computeTrackRecord, computeFunnel } from "./queries/signals";
import { fetchAllTickers } from "./engine/binance";
import { INSTRUMENTS } from "@contracts/types";


export const signalsRouter = createRouter({
  /** Signal feed — triggers a throttled pipeline pass first */
  list: publicQuery
    .input(
      z
        .object({
          symbol: z.string().nullish(),
          status: z
            .enum(["open", "tp1", "tp2", "tp3", "sl", "be", "expired", "undecidable"])
            .nullish(),
          closedOnly: z.boolean().nullish(),
          limit: z.number().min(1).max(500).nullish(),
        })
        .nullish(),
    )
    .query(async ({ input }) => {
      await ensureFresh().catch((err) => console.error("ensureFresh error:", err));
      try {
        return await listSignals({
          symbol: input?.symbol ?? undefined,
          status: input?.status ?? undefined,
          closedOnly: input?.closedOnly ?? undefined,
          limit: input?.limit ?? undefined,
        });
      } catch (err) {
        console.error("listSignals query error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch signals from database.",
          cause: err,
        });
      }
    }),

  /** Verified track record — computed only from market-graded outcomes */
  trackRecord: publicQuery.query(async () => {
    await ensureFresh().catch((err) => console.error("ensureFresh error:", err));
    try {
      return await computeTrackRecord();
    } catch (err) {
      console.error("computeTrackRecord query error:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to compute track record.",
        cause: err,
      });
    }
  }),

  /** Audit funnel: scanned → candidate → published over the last 7 days */
  funnel: publicQuery.query(async () => {
    await ensureFresh().catch((err) => console.error("ensureFresh error:", err));
    try {
      return await computeFunnel(7);
    } catch (err) {
      console.error("computeFunnel query error:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to compute funnel.",
        cause: err,
      });
    }
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
