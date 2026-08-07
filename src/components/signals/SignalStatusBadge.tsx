import type { ClientSignal } from "@contracts/instruments";
import { cn } from "@/lib/utils";
import { ExternalLink, Info, LineChart } from "lucide-react";
import { STATUS_STYLE } from "./signalFormat";

interface SignalStatusBadgeProps {
  signal: ClientSignal;
  pair?: string;
}

/**
 * Renders status pills, confidence pill, R-multiple badge, and TradingView chart trigger.
 * Inputs: props with canonical ClientSignal and optional instrument pair.
 * Outputs: React JSX header badge group.
 * Side effects: none.
 * Failure modes: none.
 */
export function SignalStatusBadge({ signal, pair }: SignalStatusBadgeProps) {
  const rMult = typeof signal.rMultiple === "number" ? Number(signal.rMultiple) : null;

  const st = signal.status === "open"
    ? signal.entryFilled
      ? {
          label: "In position",
          cls: "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse font-semibold",
        }
      : {
          label: "Live",
          cls: "bg-sky-500/15 text-sky-400 border border-sky-500/20",
        }
    : STATUS_STYLE[signal.status] ?? {
        label: signal.status,
        cls: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20",
      };

  const confCls =
    signal.confidence >= 75
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
      : signal.confidence >= 60
      ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
      : "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";

  const tvSymbol = pair ?? signal.symbol;
  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(tvSymbol)}`;

  return (
    <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
      <div className="flex items-center gap-2">
        <a
          href={tradingViewUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`View ${signal.symbol} chart on TradingView`}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-zinc-300 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 shadow-2xs"
        >
          <LineChart className="h-3 w-3 text-emerald-400" />
          <span>TradingView</span>
          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
        </a>

        {signal.status !== "open" && rMult !== null ? (
          <span
            className={cn(
              "rounded-lg px-2.5 py-0.5 font-mono text-xs font-bold shadow-xs border tabular-nums",
              rMult > 0
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                : rMult < 0
                ? "bg-red-500/20 text-red-300 border-red-500/30"
                : "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
            )}
          >
            {rMult > 0 ? "+" : ""}
            {rMult.toFixed(2)}R
          </span>
        ) : null}

        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium border", st.cls)}>
          {st.label}
        </span>
      </div>

      <span
        title="Rule-engine confidence score — 60% floor to publish"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium shadow-2xs tabular-nums cursor-help",
          confCls,
        )}
      >
        conf {signal.confidence}%
        <Info className="h-3 w-3 opacity-70" />
      </span>
    </div>
  );
}
