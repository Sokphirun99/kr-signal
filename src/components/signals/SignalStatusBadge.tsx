import type { ClientSignal } from "@contracts/instruments";
import { cn } from "@/lib/utils";
import { ExternalLink, Info, LineChart } from "lucide-react";
import { STATUS_STYLE } from "./signalFormat";

interface SignalStatusBadgeProps {
  signal: ClientSignal;
  pair?: string;
}

/**
 * Renders status pills, confidence pill, R-multiple badge, and TradingView chart trigger in a single clean row.
 * Inputs: props with canonical ClientSignal and optional instrument pair.
 * Outputs: React JSX header badge group.
 * Side effects: none.
 * Failure modes: none.
 */
export function SignalStatusBadge({ signal, pair }: SignalStatusBadgeProps) {
  const rMult =
    typeof signal.rMultiple === "number" ? Number(signal.rMultiple) : null;

  const st =
    signal.status === "open"
      ? signal.entryFilled
        ? {
            label: "In position",
            cls: "bg-amber-500/20 text-amber-300 border-amber-500/30 font-semibold",
          }
        : {
            label: "Live",
            cls: "bg-sky-500/15 text-sky-400 border-sky-500/20 font-medium",
          }
      : (STATUS_STYLE[signal.status] ?? {
          label: signal.status,
          cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20 font-medium",
        });

  const confCls =
    signal.confidence >= 75
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
      : signal.confidence >= 60
        ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
        : "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";

  const tvSymbol = pair ?? signal.symbol;
  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(tvSymbol)}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* TradingView Link */}
      <a
        href={tradingViewUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`View ${signal.symbol} chart on TradingView`}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-medium text-zinc-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400"
      >
        <LineChart className="h-3 w-3 text-emerald-400" />
        <span>TradingView</span>
        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
      </a>

      {/* Outcome R-Multiple badge when closed */}
      {signal.status !== "open" && rMult !== null && (
        <span
          className={cn(
            "inline-flex h-7 items-center rounded-md px-2 font-mono text-[11px] font-bold border tabular-nums",
            rMult > 0
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              : rMult < 0
                ? "bg-red-500/20 text-red-300 border-red-500/30"
                : "bg-zinc-500/20 text-zinc-300 border-zinc-500/30"
          )}
        >
          {rMult > 0 ? "+" : ""}
          {rMult.toFixed(2)}R
        </span>
      )}

      {/* State / Outcome Pill */}
      <span
        className={cn(
          "inline-flex h-7 items-center rounded-md px-2.5 text-[11px] border",
          st.cls
        )}
      >
        {st.label}
      </span>

      {/* Confidence Pill */}
      <span
        title="Rule-engine confluence score — 60-point floor; not a win probability"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-[11px] font-medium tabular-nums cursor-help",
          confCls
        )}
      >
        <span>score {signal.confidence}</span>
        <Info className="h-3 w-3 opacity-70" />
      </span>
    </div>
  );
}
