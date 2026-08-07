import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { EquityTooltip } from "./EquityTooltip";

interface EquityPoint {
  date: string;
  cumulativeR: number;
  tradeR: number;
}

interface EquityCurveProps {
  points: EquityPoint[];
}

function formatChartDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Renders the responsive equity curve chart visualizing cumulative R progression.
 * Inputs: props with an array of equity points.
 * Outputs: React JSX chart card.
 * Side effects: none.
 * Failure modes: none.
 */
export function EquityCurve({ points }: EquityCurveProps) {
  const isPositive = (points[points.length - 1]?.cumulativeR ?? 0) >= 0;
  const gradientId = "equityGradient";
  const lineColor = isPositive ? "#34d399" : "#f87171";
  const fillColor = isPositive ? "#34d399" : "#f87171";

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-6 shadow-xs">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Equity Curve
          </p>
          <p className="mt-0.5 text-sm text-zinc-400">
            Cumulative R-multiple · one point per tape-graded outcome
          </p>
        </div>
        <div className="text-right">
          <p
            className={`font-mono text-2xl font-semibold tabular-nums ${
              isPositive ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}
            {(points[points.length - 1]?.cumulativeR ?? 0).toFixed(2)}R
          </p>
          <p className="text-xs text-zinc-400">{points.length} trades</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={points} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} stopOpacity={0.18} />
              <stop offset="100%" stopColor={fillColor} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fill: "#9ca3af", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`}
            tick={{ fill: "#9ca3af", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            content={<EquityTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="cumulativeR"
            stroke={lineColor}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            dot={points.length <= 30 ? { r: 2.5, fill: lineColor, strokeWidth: 0 } : false}
            activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
