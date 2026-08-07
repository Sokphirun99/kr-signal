/**
 * Backtest Engine script.
 * Runs deterministic simulation of the rule-based strategy on recent market klines.
 * Usage: npx tsx scripts/backtest.ts
 * Flag: RULE_VARIANT=baseline npx tsx scripts/backtest.ts
 *       RULE_VARIANT=mtf npx tsx scripts/backtest.ts
 */

import {
  INSTRUMENTS,
  TIMEFRAMES,
  EXPIRY_MS,
  TF_MS,
  CLOSED_STATUSES,
  WIN_STATUSES,
  type Timeframe,
} from "@contracts/instruments";
import type { Signal } from "@db/schema";
import { fetchClosedKlines, type Candle } from "../server/engine/binance";
import { generateSetup, HTF_MAP, isHtfVetoed, setRangeMode, setSqueezeBreakout } from "../server/engine/strategy";
import { gateSetup } from "../server/engine/gate";
import { verifySignal, setTrailMode, type Verdict } from "../server/engine/verifier";

interface TradeRecord {
  setupIndex: number;
  mockSignal: Signal;
  verdict: Verdict;
}

interface ResultRow {
  symbol: string;
  timeframe: Timeframe | "-";
  setups: number;
  graded: number;
  wins: number;
  winRate: number;
  avgR: number;
  totalR: number;
  grossProfits: number;
  grossLosses: number;
  profitFactor: number;
}

const CRYPTO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "XAUUSD"];
const WINDOW_SIZE = 300;

function formatProfitFactor(pf: number): string {
  if (!Number.isFinite(pf)) return "Inf";
  return pf.toFixed(2);
}

function formatR(val: number): string {
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}R`;
}

function formatPct(val: number): string {
  return `${val.toFixed(1)}%`;
}

async function runBacktest(): Promise<void> {
  const variant = process.env.RULE_VARIANT || "chandelier";
  console.log(`\n=== KR-Signal Backtest Engine [Variant: ${variant}] ===\n`);

  if (variant === "touch" || variant === "baseline") {
    setRangeMode("touch");
  } else {
    setRangeMode("sweep");
  }

  if (variant === "squeeze" || variant === "chandelier") {
    setSqueezeBreakout(true);
  } else {
    setSqueezeBreakout(false);
  }

  if (variant === "fixed" || variant === "baseline") {
    setTrailMode("fixed");
  } else {
    setTrailMode("chandelier");
  }




  const cryptoInstruments = INSTRUMENTS.filter((i) =>
    CRYPTO_SYMBOLS.includes(i.symbol),
  );

  const rows: ResultRow[] = [];

  for (const inst of cryptoInstruments) {
    console.log(`Fetching 1000 klines for ${inst.symbol} across all timeframes...`);
    const candleMap = new Map<Timeframe, Candle[]>();
    for (const tf of TIMEFRAMES) {
      candleMap.set(tf, await fetchClosedKlines(inst.pair, tf, 1000));
    }

    for (const tf of TIMEFRAMES) {
      const candles = candleMap.get(tf)!;
      const htfTf = HTF_MAP[tf];
      const htfAllCandles = htfTf ? candleMap.get(htfTf) : undefined;

      let setups = 0;
      const trades: TradeRecord[] = [];

      for (let i = WINDOW_SIZE - 1; i < candles.length; i++) {
        const windowCandles = candles.slice(i - WINDOW_SIZE + 1, i + 1);
        const setup = generateSetup(windowCandles, tf, null, null, null, null, inst.symbol);
        if (!setup) continue;

        setups++;

        // Check HTF Veto if MTF variant
        if (variant === "mtf" && htfTf && htfAllCandles) {
          const targetHtf: Timeframe = htfTf;
          const setupCloseTime = candles[i].openTime + TF_MS[tf];
          const availableHtf = htfAllCandles.filter(
            (c) => c.openTime + TF_MS[targetHtf] <= setupCloseTime,
          );
          if (isHtfVetoed(tf, setup.side, availableHtf)) {
            continue;
          }
        }

        // Check cooldown: is a setup with the same side currently open at candle i?
        const isSameSideOpen = trades.some((t) => {
          if (t.mockSignal.side !== setup.side) return false;
          const currentTape = candles.slice(t.setupIndex + 1, i + 1);
          const currentVerdict = verifySignal(t.mockSignal, currentTape);
          return currentVerdict.status === "open";
        });

        const ignoreVolume =
          variant === "baseline" ||
          variant === "mtf" ||
          variant === "touch";
        const ignoreOffHours =
          variant === "baseline" ||
          variant === "mtf" ||
          variant === "touch" ||
          variant === "offhours_off";
        const gate = gateSetup(setup, isSameSideOpen, {
          ignoreVolume,
          ignoreOffHours,
          symbol: inst.symbol,
        });
        if (!gate.pass) continue;



        const mockSignal: Signal = {
          id: trades.length + 1,
          symbol: inst.symbol,
          market: inst.market,
          timeframe: tf,
          style: setup.style,
          side: setup.side,
          entry: setup.entry,
          stopLoss: setup.stopLoss,
          tp1: setup.tp1,
          tp2: setup.tp2,
          tp3: setup.tp3,
          confidence: gate.confidence,
          status: "open",
          engine: "rules",
          entryFilled: false,
          rMultiple: null,
          exitPrice: null,
          setupAt: new Date(setup.setupAt),
          openedAt: new Date(setup.setupAt),
          expiresAt: new Date(setup.setupAt + EXPIRY_MS[tf]),
          closedAt: null,
        };

        const futureTape = candles.slice(i + 1);
        const finalVerdict = verifySignal(mockSignal, futureTape);

        trades.push({
          setupIndex: i,
          mockSignal,
          verdict: finalVerdict,
        });
      }

      const gradedTrades = trades.filter((t) =>
        CLOSED_STATUSES.includes(t.verdict.status),
      );
      const graded = gradedTrades.length;
      const wins = gradedTrades.filter((t) =>
        WIN_STATUSES.includes(t.verdict.status),
      ).length;
      const winRate = graded > 0 ? (wins / graded) * 100 : 0;
      const totalR = gradedTrades.reduce(
        (sum, t) => sum + (t.verdict.rMultiple ?? 0),
        0,
      );
      const avgR = graded > 0 ? totalR / graded : 0;

      const grossProfits = gradedTrades.reduce((sum, t) => {
        const r = t.verdict.rMultiple ?? 0;
        return r > 0 ? sum + r : sum;
      }, 0);

      const grossLosses = gradedTrades.reduce((sum, t) => {
        const r = t.verdict.rMultiple ?? 0;
        return r < 0 ? sum + Math.abs(r) : sum;
      }, 0);

      const profitFactor =
        grossLosses === 0
          ? grossProfits > 0
            ? Infinity
            : 0
          : grossProfits / grossLosses;

      rows.push({
        symbol: inst.symbol,
        timeframe: tf,
        setups,
        graded,
        wins,
        winRate,
        avgR,
        totalR,
        grossProfits,
        grossLosses,
        profitFactor,
      });
    }
  }

  // Grand Total calculation
  const totalSetups = rows.reduce((s, r) => s + r.setups, 0);
  const totalGraded = rows.reduce((s, r) => s + r.graded, 0);
  const totalWins = rows.reduce((s, r) => s + r.wins, 0);
  const totalWinRate = totalGraded > 0 ? (totalWins / totalGraded) * 100 : 0;
  const totalR = rows.reduce((s, r) => s + r.totalR, 0);
  const grandAvgR = totalGraded > 0 ? totalR / totalGraded : 0;
  const grandGrossProfits = rows.reduce((s, r) => s + r.grossProfits, 0);
  const grandGrossLosses = rows.reduce((s, r) => s + r.grossLosses, 0);
  const grandProfitFactor =
    grandGrossLosses === 0
      ? grandGrossProfits > 0
        ? Infinity
        : 0
      : grandGrossProfits / grandGrossLosses;

  const totalRow: ResultRow = {
    symbol: "GRAND TOTAL",
    timeframe: "-",
    setups: totalSetups,
    graded: totalGraded,
    wins: totalWins,
    winRate: totalWinRate,
    avgR: grandAvgR,
    totalR,
    grossProfits: grandGrossProfits,
    grossLosses: grandGrossLosses,
    profitFactor: grandProfitFactor,
  };

  // Render Table
  console.log("\nBacktest Summary Results:");
  console.log(
    "-----------------------------------------------------------------------------------------",
  );
  console.log(
    "Symbol".padEnd(12) +
      "TF".padEnd(6) +
      "Setups".padStart(8) +
      "Graded".padStart(8) +
      "Wins".padStart(8) +
      "Win Rate".padStart(12) +
      "Avg R".padStart(10) +
      "Total R".padStart(12) +
      "Profit Factor".padStart(15),
  );
  console.log(
    "-----------------------------------------------------------------------------------------",
  );

  for (const r of rows) {
    console.log(
      r.symbol.padEnd(12) +
        r.timeframe.padEnd(6) +
        String(r.setups).padStart(8) +
        String(r.graded).padStart(8) +
        String(r.wins).padStart(8) +
        formatPct(r.winRate).padStart(12) +
        formatR(r.avgR).padStart(10) +
        formatR(r.totalR).padStart(12) +
        formatProfitFactor(r.profitFactor).padStart(15),
    );
  }

  console.log(
    "-----------------------------------------------------------------------------------------",
  );
  console.log(
    totalRow.symbol.padEnd(12) +
      totalRow.timeframe.padEnd(6) +
      String(totalRow.setups).padStart(8) +
      String(totalRow.graded).padStart(8) +
      String(totalRow.wins).padStart(8) +
      formatPct(totalRow.winRate).padStart(12) +
      formatR(totalRow.avgR).padStart(10) +
      formatR(totalRow.totalR).padStart(12) +
      formatProfitFactor(totalRow.profitFactor).padStart(15),
  );
  console.log(
    "-----------------------------------------------------------------------------------------\n",
  );
}

runBacktest().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
