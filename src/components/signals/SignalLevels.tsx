import { useState } from "react";
import { formatPrice } from "@contracts/instruments";
import type { ClientSignal } from "@contracts/instruments";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { optionalNumber } from "./signalFormat";

interface LevelProps {
  label: string;
  value: number;
  decimals: number;
}

function Level({ label, value, decimals }: LevelProps) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-zinc-100 mt-0.5">
        {formatPrice(value, decimals)}
      </p>
    </div>
  );
}

interface AnalysisMetricProps {
  label: string;
  value: string;
  detail: string;
}

function AnalysisMetric({ label, value, detail }: AnalysisMetricProps) {
  return (
    <div className="rounded-md border border-white/5 bg-black/20 px-2.5 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-zinc-100">{value}</p>
      <p className="mt-0.5 text-[10px] text-zinc-500">{detail}</p>
    </div>
  );
}

interface SignalTechnicalAnalysisProps {
  symbol: string;
  timeframe: ClientSignal["timeframe"];
  decimals: number;
  entry: number;
}

function SignalTechnicalAnalysis({
  symbol,
  timeframe,
  decimals,
  entry,
}: SignalTechnicalAnalysisProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const query = trpc.signals.analysis.useQuery(
    { symbol, timeframe },
    { refetchInterval: 60_000, staleTime: 25_000 },
  );
  const analysis = query.data?.analysis;

  let distLabel = "";
  if (analysis?.currentPrice) {
    const pct = ((analysis.currentPrice - entry) / entry) * 100;
    const absPct = Math.abs(pct).toFixed(2);
    distLabel = pct > 0 ? `${absPct}% above entry` : `${absPct}% below entry`;
  }

  return (
    <section className="mt-4 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              Live technical analysis
            </p>
            {distLabel && (
              <span className="rounded-md bg-white/[0.06] border border-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                {distLabel}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Latest completed {timeframe} candle · automatic for this signal
          </p>
        </div>
        {analysis && (
          <div className="flex items-center gap-2 text-[11px] font-medium">
            <span
              className={cn(
                "capitalize",
                analysis.directionalBias === "bullish"
                  ? "text-emerald-400"
                  : analysis.directionalBias === "bearish"
                  ? "text-red-400"
                  : "text-zinc-400",
              )}
            >
              {analysis.directionalBias} bias
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 capitalize text-zinc-300">
              {analysis.regime}
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10 transition-colors"
            >
              <span>{isExpanded ? "Collapse" : "All indicators"}</span>
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>

      {query.isLoading ? (
        <p className="mt-3 text-xs text-zinc-500">Loading indicator values…</p>
      ) : query.isError ? (
        <p className="mt-3 text-xs text-red-300">Technical data is temporarily unavailable.</p>
      ) : analysis ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
          <AnalysisMetric
            label="Current price"
            value={formatPrice(analysis.currentPrice, decimals)}
            detail="Last close"
          />
          <AnalysisMetric label="RSI 14" value={analysis.rsi14.toFixed(1)} detail="Momentum" />
          <AnalysisMetric
            label="ADX / DMI"
            value={optionalNumber(analysis.adx14, 1)}
            detail={`+DI ${optionalNumber(analysis.plusDi14, 1)} · −DI ${optionalNumber(
              analysis.minusDi14,
              1,
            )}`}
          />
          <AnalysisMetric
            label="ATR 14"
            value={formatPrice(analysis.atr14, decimals)}
            detail={`${(analysis.atrPercentile * 100).toFixed(0)}th percentile`}
          />

          {isExpanded && (
            <>
              <AnalysisMetric
                label="EMA 20"
                value={formatPrice(analysis.ema20, decimals)}
                detail="Fast average"
              />
              <AnalysisMetric
                label="EMA 50"
                value={formatPrice(analysis.ema50, decimals)}
                detail="Slow average"
              />
              <AnalysisMetric
                label="Relative volume"
                value={`${analysis.relativeVolume.toFixed(2)}×`}
                detail="vs 20-candle mean"
              />
              <AnalysisMetric
                label="VWAP"
                value={analysis.vwap === null ? "—" : formatPrice(analysis.vwap, decimals)}
                detail="Volume-weighted price"
              />
              <AnalysisMetric
                label="Bollinger %B"
                value={optionalNumber(analysis.bollingerPercentB, 2)}
                detail="0 lower · 1 upper"
              />
              <AnalysisMetric
                label="Squeeze"
                value={analysis.ttmSqueeze ? "Active" : "Inactive"}
                detail={`${analysis.squeezeLength} low-vol candles`}
              />
              <AnalysisMetric
                label="RSI divergence"
                value={
                  analysis.bullishDivergence
                    ? "Bullish"
                    : analysis.bearishDivergence
                    ? "Bearish"
                    : "None"
                }
                detail="20-candle heuristic"
              />
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

interface SignalLevelsProps {
  signal: ClientSignal;
  decimals: number;
}

/**
 * Renders the Entry, Stop Loss, TP1, TP2, TP3, R:R ratio grid, and live indicator panel.
 * Inputs: props containing ClientSignal and price decimals.
 * Outputs: React JSX level grid and technical analysis expander.
 * Side effects: queries tRPC for indicator snapshots.
 * Failure modes: renders graceful error states on query failures.
 */
export function SignalLevels({ signal, decimals }: SignalLevelsProps) {
  const stopDiff = Math.abs(signal.entry - signal.stopLoss);
  const isCapped = signal.tp3 > 0 && Math.abs(signal.tp3 - signal.tp2) < 1e-6;
  const maxTp = isCapped ? signal.tp2 : signal.tp3;
  const rr = stopDiff > 0 ? Math.abs(maxTp - signal.entry) / stopDiff : 0;

  return (
    <>
      <div
        className={cn(
          "mt-4 grid gap-4 rounded-lg bg-black/20 p-3 border border-white/5",
          isCapped ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-3 sm:grid-cols-6",
        )}
      >
        <Level label="Entry" value={signal.entry} decimals={decimals} />
        <Level label="Stop" value={signal.stopLoss} decimals={decimals} />
        <Level label="TP1" value={signal.tp1} decimals={decimals} />
        <Level
          label={isCapped ? "TP2 · final" : "TP2"}
          value={signal.tp2}
          decimals={decimals}
        />
        {!isCapped && <Level label="TP3" value={signal.tp3} decimals={decimals} />}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            {isCapped ? "Max R:R" : "R:R"}
          </p>
          <p className="font-mono text-sm font-semibold tabular-nums text-zinc-100 mt-0.5">
            1 : {rr.toFixed(1)}
          </p>
        </div>
      </div>

      <SignalTechnicalAnalysis
        symbol={signal.symbol}
        timeframe={signal.timeframe}
        decimals={decimals}
        entry={signal.entry}
      />
    </>
  );
}
