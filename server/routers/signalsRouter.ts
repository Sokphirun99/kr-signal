import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { setPublicReadCache } from "../context";
import {
  listSignals,
  computeTrackRecord,
  computeFunnel,
} from "../queries/signals";
import { fetchAllTickers, fetchClosedKlines } from "../engine/binance";
import { generateSetup } from "../engine/strategy";
import { gateSetup } from "../engine/gate";
import { analyzeTechnicalData } from "../engine/analysis";
import { INSTRUMENTS, TIMEFRAMES } from "@contracts/instruments";

export const signalsRouter = createRouter({
  /** Signal feed — reads the latest completed background pipeline snapshot. */
  list: publicQuery
    .input(
      z
        .object({
          symbol: z.string().nullish(),
          status: z
            .enum([
              "open",
              "tp1",
              "tp2",
              "tp3",
              "sl",
              "be",
              "expired",
              "undecidable",
            ])
            .nullish(),
          closedOnly: z.boolean().nullish(),
          historyOnly: z.boolean().nullish(),
          limit: z.number().min(1).max(500).nullish(),
        })
        .nullish()
    )
    .query(async ({ input, ctx }) => {
      try {
        const result = await listSignals({
          symbol: input?.symbol ?? undefined,
          status: input?.status ?? undefined,
          closedOnly: input?.closedOnly ?? undefined,
          historyOnly: input?.historyOnly ?? undefined,
          limit: input?.limit ?? undefined,
        });
        setPublicReadCache(ctx, 30, 120);
        return result;
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
  trackRecord: publicQuery.query(async ({ ctx }) => {
    try {
      const result = await computeTrackRecord();
      setPublicReadCache(ctx, 300, 900);
      return result;
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
  funnel: publicQuery.query(async ({ ctx }) => {
    try {
      const result = await computeFunnel(7);
      setPublicReadCache(ctx, 300, 900);
      return result;
    } catch (err) {
      console.error("computeFunnel query error:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to compute funnel.",
        cause: err,
      });
    }
  }),

  /**
   * A read-only indicator snapshot. This does not run the pipeline or publish
   * a signal; it lets the UI explain the same market inputs the engine uses.
   */
  analysis: publicQuery
    .input(
      z.object({
        symbol: z
          .string()
          .refine(
            symbol =>
              INSTRUMENTS.some(instrument => instrument.symbol === symbol),
            "Unsupported instrument"
          ),
        timeframe: z.enum(TIMEFRAMES),
      })
    )
    .query(async ({ input, ctx }) => {
      const instrument = INSTRUMENTS.find(item => item.symbol === input.symbol);
      if (!instrument) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unsupported instrument.",
        });
      }

      try {
        const candles = await fetchClosedKlines(
          instrument.pair,
          input.timeframe,
          300,
          instrument.dataSource
        );
        const analysis = analyzeTechnicalData(candles);
        if (!analysis) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Not enough closed candles to calculate technical analysis.",
          });
        }

        const setup = generateSetup(candles, input.timeframe);
        const gate = setup ? gateSetup(setup, false) : null;
        const result = {
          instrument: {
            symbol: instrument.symbol,
            name: instrument.name,
            market: instrument.market,
            decimals: instrument.decimals,
            basisNote: instrument.basisNote ?? null,
          },
          timeframe: input.timeframe,
          analysis,
          candidate: setup
            ? {
                side: setup.side,
                style: setup.style,
                entry: setup.entry,
                stopLoss: setup.stopLoss,
                tp1: setup.tp1,
                tp2: setup.tp2,
                tp3: setup.tp3,
              }
            : null,
          gate,
        };
        setPublicReadCache(ctx, 120, 300);
        return result;
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("technical analysis query error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to load market analysis right now.",
          cause: err,
        });
      }
    }),

  /** Live ticker tape across all instruments */
  ticker: publicQuery.query(async ({ ctx }) => {
    try {
      const tickers = await fetchAllTickers(
        INSTRUMENTS.map(i => ({ pair: i.pair, source: i.dataSource }))
      );
      const result = INSTRUMENTS.map(inst => {
        const t = tickers.find(x => x.pair === inst.pair);
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
      setPublicReadCache(ctx, 30, 60);
      return result;
    } catch {
      const result = INSTRUMENTS.map(inst => ({
        symbol: inst.symbol,
        name: inst.name,
        market: inst.market,
        decimals: inst.decimals,
        basisNote: inst.basisNote ?? null,
        lastPrice: null,
        priceChangePct: null,
        quoteVolume: null,
      }));
      setPublicReadCache(ctx, 10, 20);
      return result;
    }
  }),
});
