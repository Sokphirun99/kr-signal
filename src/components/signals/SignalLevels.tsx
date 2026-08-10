import { useState } from "react";
import {
  formatPrice,
  type Timeframe,
  type ClientSignal,
} from "@contracts/instruments";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { optionalNumber } from "./signalFormat";

interface LevelCardProps {
  label: string;
  value: number | string;
  decimals?: number;
  subtitle: string;
  subtitleType?: "risk" | "reward" | "neutral";
}

function LevelCard({
  label,
  value,
  decimals,
  subtitle,
  subtitleType = "neutral",
}: LevelCardProps) {
  const formattedValue =
    typeof value === "number" && decimals !== undefined
      ? formatPrice(value, decimals)
      : String(value);

  return (
    <div className="rounded-lg border border-white/5 bg-black/30 p-2.5 transition-colors hover:border-white/10">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-white">
        {formattedValue}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[10px] font-medium",
          subtitleType === "risk"
            ? "text-red-400"
            : subtitleType === "reward"
              ? "text-emerald-400"
              : "text-zinc-400"
        )}
      >
        {subtitle}
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
      <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-zinc-100">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">{detail}</p>
    </div>
  );
}

interface SignalTechnicalAnalysisProps {
  symbol: string;
  timeframe: Timeframe;
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
    {
      staleTime: 300_000,
      refetchOnWindowFocus: false,
    }
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
                    : "text-zinc-400"
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
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <span>{isExpanded ? "Collapse" : "All indicators"}</span>
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
        )}
      </div>

      {query.isLoading ? (
        <p className="mt-3 text-xs text-zinc-500">Loading indicator values…</p>
      ) : query.isError ? (
        <p className="mt-3 text-xs text-red-300">
          Technical data is temporarily unavailable.
        </p>
      ) : analysis ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
          <AnalysisMetric
            label="Current price"
            value={formatPrice(analysis.currentPrice, decimals)}
            detail="Last close"
          />
          <AnalysisMetric
            label="RSI 14"
            value={analysis.rsi14.toFixed(1)}
            detail="Momentum"
          />
          <AnalysisMetric
            label="ADX / DMI"
            value={optionalNumber(analysis.adx14, 1)}
            detail={`+DI ${optionalNumber(analysis.plusDi14, 1)} · −DI ${optionalNumber(
              analysis.minusDi14,
              1
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
                value={
                  analysis.vwap === null
                    ? "—"
                    : formatPrice(analysis.vwap, decimals)
                }
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
 * Renders the Entry, Stop Loss, TP1-3 levels, and R:R ratio in distinct containerized boxes.
 * Inputs: props containing ClientSignal and price decimals.
 * Outputs: React JSX containerized level grid and technical analysis.
 * Side effects: queries tRPC for indicator snapshots.
 * Failure modes: renders graceful error states on query failures.
 */
export function SignalLevels({ signal, decimals }: SignalLevelsProps) {
  const stopDiff = Math.abs(signal.entry - signal.stopLoss);
  const isCapped = signal.tp3 > 0 && Math.abs(signal.tp3 - signal.tp2) < 1e-6;
  const maxTp = isCapped ? signal.tp2 : signal.tp3;
  const rr = stopDiff > 0 ? Math.abs(maxTp - signal.entry) / stopDiff : 0;

  const riskPct = signal.entry > 0 ? (stopDiff / signal.entry) * 100 : 0;
  const tp1Delta = Math.abs(signal.tp1 - signal.entry);
  const tp1Pct = signal.entry > 0 ? (tp1Delta / signal.entry) * 100 : 0;
  const tp2Delta = Math.abs(signal.tp2 - signal.entry);
  const tp2Pct = signal.entry > 0 ? (tp2Delta / signal.entry) * 100 : 0;
  const tp3Delta = Math.abs(signal.tp3 - signal.entry);
  const tp3Pct = signal.entry > 0 ? (tp3Delta / signal.entry) * 100 : 0;

  return (
    <>
      {/* Containerized Level Cards Grid */}
      <div
        className={cn(
          "mt-4 grid gap-2.5",
          isCapped
            ? "grid-cols-2 sm:grid-cols-5"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        )}
      >
        <LevelCard
          label="Entry"
          value={signal.entry}
          decimals={decimals}
          subtitle="Pivot price"
          subtitleType="neutral"
        />

        <LevelCard
          label="Stop Loss"
          value={signal.stopLoss}
          decimals={decimals}
          subtitle={`-${riskPct.toFixed(2)}% (1.0R risk)`}
          subtitleType="risk"
        />

        <LevelCard
          label="Target 1"
          value={signal.tp1}
          decimals={decimals}
          subtitle={`+${tp1Pct.toFixed(2)}% (1.4R)`}
          subtitleType="reward"
        />

        <LevelCard
          label={isCapped ? "Target 2 (Final)" : "Target 2"}
          value={signal.tp2}
          decimals={decimals}
          subtitle={`+${tp2Pct.toFixed(2)}% (2.2R)`}
          subtitleType="reward"
        />

        {!isCapped && (
          <LevelCard
            label="Target 3"
            value={signal.tp3}
            decimals={decimals}
            subtitle={`+${tp3Pct.toFixed(2)}% (3.0R)`}
            subtitleType="reward"
          />
        )}

        <LevelCard
          label="Max R:R"
          value={`1 : ${rr.toFixed(1)}`}
          subtitle="Reward / Risk"
          subtitleType="reward"
        />
      </div>

      {/* Live Technical Analysis Panel */}
      <SignalTechnicalAnalysis
        symbol={signal.symbol}
        timeframe={signal.timeframe as Timeframe}
        decimals={decimals}
        entry={signal.entry}
      />
    </>
  );
}
