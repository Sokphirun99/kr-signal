import type { TooltipProps } from "recharts";

/**
 * Custom tooltip component rendering details of cumulative and trade R-multiples.
 * Inputs: active status and payload from Recharts.
 * Outputs: React JSX tooltip card or null when inactive.
 * Side effects: none.
 * Failure modes: returns null if inactive or missing payload.
 */
export function EquityTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { date: string; cumulativeR: number; tradeR: number };
  const dateLabel =
    new Date(d.date).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC";
  const isPositive = d.cumulativeR >= 0;

  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/95 px-3.5 py-2.5 shadow-xl">
      <p className="mb-1 text-[11px] font-medium text-zinc-400">{dateLabel}</p>
      <p
        className={`font-mono text-sm font-semibold tabular-nums ${
          isPositive ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPositive ? "+" : ""}
        {d.cumulativeR.toFixed(2)}R cumulative
      </p>
      <p
        className={`font-mono text-xs tabular-nums ${
          d.tradeR > 0
            ? "text-emerald-400/80"
            : d.tradeR < 0
            ? "text-red-400/80"
            : "text-zinc-400"
        }`}
      >
        trade: {d.tradeR > 0 ? "+" : ""}
        {d.tradeR.toFixed(2)}R
      </p>
    </div>
  );
}
