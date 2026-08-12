import { useState } from "react";
import {
  formatPrice,
  type Timeframe,
  type ClientSignal,
} from "@contracts/instruments";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Activity,
  Brain,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { optionalNumber } from "./signalFormat";
import { parseAiForecastSnapshot } from "@contracts/aiForecast";

interface LevelCardProps {
  label: string;
  value: number | string;
  decimals?: number;
  subtitle: string;
  type?: "entry" | "risk" | "reward" | "rr";
}

/**
 * High-contrast containerized card for individual trade price levels.
 */
function LevelCard({
  label,
  value,
  decimals,
  subtitle,
  type = "entry",
}: LevelCardProps) {
  const formattedValue =
    typeof value === "number" && decimals !== undefined
      ? formatPrice(value, decimals)
      : String(value);

  const containerStyles = {
    entry: "border-sky-500/20 bg-sky-500/[0.04] hover:border-sky-500/30",
    risk: "border-red-500/25 bg-red-500/[0.06] hover:border-red-500/35",
    reward: "border-emerald-500/25 bg-emerald-500/[0.06] hover:border-emerald-500/35",
    rr: "border-purple-500/20 bg-purple-500/[0.04] hover:border-purple-500/30",
  };

  const labelStyles = {
    entry: "text-sky-300",
    risk: "text-red-400",
    reward: "text-emerald-400",
    rr: "text-purple-300",
  };

  const subtitleStyles = {
    entry: "text-zinc-400",
    risk: "text-red-400 font-semibold",
    reward: "text-emerald-400 font-semibold",
    rr: "text-purple-300 font-semibold",
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 transition-all",
        containerStyles[type]
      )}
    >
      <span className={cn("text-[10px] font-bold uppercase tracking-wider", labelStyles[type])}>
        {label}
      </span>
      <p className="mt-1 font-mono text-sm font-extrabold tabular-nums text-white">
        {formattedValue}
      </p>
      <p className={cn("mt-0.5 font-mono text-[10px]", subtitleStyles[type])}>
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
    <div className="rounded-md border border-white/5 bg-black/30 px-2.5 py-2">
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

interface AiConsensusBannerProps {
  signal: ClientSignal;
  decimals: number;
}

/**
 * Compact, instant consensus summary between the Rule Engine and AI Neural Model.
 */
function AiConsensusBanner({ signal, decimals }: AiConsensusBannerProps) {
  const forecast = parseAiForecastSnapshot(signal.strategyContext?.aiForecast);
  if (!forecast) return null;

  const isBuy = signal.side === "buy";
  const isAligned =
    (isBuy && forecast.direction === "bullish") ||
    (!isBuy && forecast.direction === "bearish");
  const isDivergent =
    (isBuy && forecast.direction === "bearish") ||
    (!isBuy && forecast.direction === "bullish");

  if (isAligned) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="font-semibold">AI Confirmed</span>
          <span className="text-zinc-400">·</span>
          <span className="text-zinc-300">
            Model expects {forecast.direction} continuation (
            {forecast.expectedChangePct >= 0 ? "+" : ""}
            {forecast.expectedChangePct.toFixed(2)}% · {Math.round(forecast.pathAgreement * 100)}% path agreement)
          </span>
        </div>
        <span className="hidden sm:inline-block rounded-full bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300 uppercase">
          Consensus
        </span>
      </div>
    );
  }

  if (isDivergent) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="font-bold text-amber-400">AI Divergence</span>
          <span className="text-zinc-400">·</span>
          <span className="text-amber-200/90">
            Caution: AI model predicts opposite move ({forecast.direction}{" "}
            {forecast.expectedChangePct >= 0 ? "+" : ""}
            {forecast.expectedChangePct.toFixed(2)}% to {formatPrice(forecast.forecastPrice, decimals)})
          </span>
        </div>
        <span className="hidden sm:inline-block rounded-full bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
          Caution
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-500/20 bg-zinc-500/[0.05] px-3 py-2 text-xs text-zinc-300">
      <Info className="h-4 w-4 shrink-0 text-zinc-400" />
      <span className="font-semibold text-zinc-300">AI Neutral</span>
      <span className="text-zinc-500">·</span>
      <span className="text-zinc-400">Model expects flat or consolidation range</span>
    </div>
  );
}

export interface SignalLevelsProps {
  signal: ClientSignal;
  decimals: number;
}

/**
 * Main trade level presentation component with intuitive visual hierarchy.
 */
export function SignalLevels({ signal, decimals }: SignalLevelsProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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

  const forecast = parseAiForecastSnapshot(signal.strategyContext?.aiForecast);

  const query = trpc.signals.analysis.useQuery(
    { symbol: signal.symbol, timeframe: signal.timeframe as Timeframe },
    {
      staleTime: 300_000,
      refetchOnWindowFocus: false,
    }
  );
  const analysis = query.data?.analysis;

  let distLabel = "";
  if (analysis?.currentPrice && signal.entry > 0) {
    const pct = ((analysis.currentPrice - signal.entry) / signal.entry) * 100;
    const absPct = Math.abs(pct).toFixed(2);
    distLabel = pct > 0 ? `${absPct}% above entry` : `${absPct}% below entry`;
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Instant AI Alignment Banner */}
      <AiConsensusBanner signal={signal} decimals={decimals} />

      {/* Core Execution Levels Grid */}
      <div
        className={cn(
          "grid gap-2",
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
          type="entry"
        />

        <LevelCard
          label="Stop Loss"
          value={signal.stopLoss}
          decimals={decimals}
          subtitle={`-${riskPct.toFixed(2)}% (1.0R risk)`}
          type="risk"
        />

        <LevelCard
          label="Target 1"
          value={signal.tp1}
          decimals={decimals}
          subtitle={`+${tp1Pct.toFixed(2)}% (1.4R)`}
          type="reward"
        />

        <LevelCard
          label={isCapped ? "Target 2 (Final)" : "Target 2"}
          value={signal.tp2}
          decimals={decimals}
          subtitle={`+${tp2Pct.toFixed(2)}% (2.2R)`}
          type="reward"
        />

        {!isCapped && (
          <LevelCard
            label="Target 3"
            value={signal.tp3}
            decimals={decimals}
            subtitle={`+${tp3Pct.toFixed(2)}% (3.0R)`}
            type="reward"
          />
        )}

        <LevelCard
          label="Max R:R"
          value={`1 : ${rr.toFixed(1)}`}
          subtitle="Reward / Risk"
          type="rr"
        />
      </div>

      {/* Collapsible Deep Analysis & Indicators Drawer */}
      <div className="rounded-lg border border-white/10 bg-black/20 overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs text-zinc-300 hover:bg-white/[0.03] transition-colors cursor-pointer"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-semibold text-zinc-200">
              Indicators & AI Forecast Details
            </span>
            {distLabel && (
              <span className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                {distLabel}
              </span>
            )}
            {analysis && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                <span>·</span>
                <span className={analysis.directionalBias === "bullish" ? "text-emerald-400" : analysis.directionalBias === "bearish" ? "text-red-400" : "text-zinc-400"}>
                  {analysis.directionalBias} bias
                </span>
                <span>·</span>
                <span className="capitalize">{analysis.regime}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
            <span>{isDrawerOpen ? "Hide" : "Expand"}</span>
            {isDrawerOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </div>
        </button>

        {isDrawerOpen && (
          <div className="border-t border-white/5 p-3.5 space-y-4 bg-black/30">
            {/* AI Model Deep Metrics (If present) */}
            {forecast && (
              <div>
                <div className="flex items-center gap-2 text-violet-300">
                  <Brain className="h-3.5 w-3.5 text-violet-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Granite TTM AI Snapshot ({forecast.direction})
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <AnalysisMetric
                    label="Forecast Close"
                    value={formatPrice(forecast.forecastPrice, decimals)}
                    detail={`${forecast.horizonCandles} × ${signal.timeframe} forward`}
                  />
                  <AnalysisMetric
                    label="Expected Move"
                    value={`${forecast.expectedChangePct >= 0 ? "+" : ""}${forecast.expectedChangePct.toFixed(2)}%`}
                    detail="Model estimation"
                  />
                  <AnalysisMetric
                    label="Forecast Range"
                    value={`${formatPrice(forecast.rangeLow, decimals)}–${formatPrice(forecast.rangeHigh, decimals)}`}
                    detail="Band bounds"
                  />
                  <AnalysisMetric
                    label="Path Agreement"
                    value={`${Math.round(forecast.pathAgreement * 100)}%`}
                    detail="Consensus steps"
                  />
                </div>
              </div>
            )}

            {/* Technical Analysis Indicators */}
            <div>
              <div className="flex items-center gap-2 text-emerald-300">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Live Technical Indicators ({signal.timeframe})
                </span>
              </div>

              {query.isLoading ? (
                <p className="mt-2 text-xs text-zinc-500">Loading indicators…</p>
              ) : query.isError ? (
                <p className="mt-2 text-xs text-red-300">Indicators temporarily unavailable.</p>
              ) : analysis ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <AnalysisMetric
                    label="Current Price"
                    value={formatPrice(analysis.currentPrice, decimals)}
                    detail="Last close"
                  />
                  <AnalysisMetric
                    label="RSI (14)"
                    value={analysis.rsi14.toFixed(1)}
                    detail="Momentum"
                  />
                  <AnalysisMetric
                    label="ADX / DMI"
                    value={optionalNumber(analysis.adx14, 1)}
                    detail={`+DI ${optionalNumber(analysis.plusDi14, 1)} · -DI ${optionalNumber(analysis.minusDi14, 1)}`}
                  />
                  <AnalysisMetric
                    label="ATR (14)"
                    value={formatPrice(analysis.atr14, decimals)}
                    detail={`${(analysis.atrPercentile * 100).toFixed(0)}th percentile`}
                  />
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
                    label="Relative Volume"
                    value={`${analysis.relativeVolume.toFixed(2)}×`}
                    detail="vs 20-candle mean"
                  />
                  <AnalysisMetric
                    label="TTM Squeeze"
                    value={analysis.ttmSqueeze ? "Active" : "Inactive"}
                    detail={`${analysis.squeezeLength} low-vol candles`}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
