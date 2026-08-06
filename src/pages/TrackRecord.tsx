import Layout from "@/components/Layout";
import StatCard from "@/components/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useSupabaseSignals, computeTrackFromSignals } from "@/hooks/useSupabaseSignals";
import { Link } from "react-router";
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
import type { TooltipProps } from "recharts";

const EQUITY_CURVE_MIN_TRADES = 3;

/** Skeleton for one metric StatCard */
function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-9 w-20" />
      <Skeleton className="mt-2 h-3 w-36" />
    </div>
  );
}

/** Skeleton for the equity curve panel */
function EquityCurveSkeleton() {
  return (
    <div className="mt-8 rounded-xl border border-white/5 bg-white/[0.02] p-6">
      <div className="mb-5 flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
      {/* Chart body */}
      <div className="relative h-[280px] w-full overflow-hidden rounded-lg">
        <Skeleton className="h-full w-full" />
        {/* Fake grid lines for depth */}
        <div className="absolute inset-0 flex flex-col justify-between px-0 py-4 pointer-events-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-px w-full bg-white/[0.04]" />
          ))}
        </div>
      </div>
    </div>
  );
}

function pct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

function formatR(val: number | null): string {
  if (val === null) return "—";
  return `${val > 0 ? "+" : ""}${val.toFixed(2)}R`;
}

function formatChartDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

/** Custom tooltip for the equity curve chart */
function EquityTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { date: string; cumulativeR: number; tradeR: number };
  const dateLabel = new Date(d.date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const positive = d.cumulativeR >= 0;
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2.5 shadow-xl">
      <p className="mb-1 text-[11px] text-zinc-500">{dateLabel}</p>
      <p className={`font-mono text-sm font-semibold ${positive ? "text-emerald-400" : "text-red-400"}`}>
        {positive ? "+" : ""}{d.cumulativeR.toFixed(2)}R cumulative
      </p>
      <p className={`font-mono text-xs ${d.tradeR > 0 ? "text-emerald-400/70" : d.tradeR < 0 ? "text-red-400/70" : "text-zinc-400"}`}>
        trade: {d.tradeR > 0 ? "+" : ""}{d.tradeR.toFixed(2)}R
      </p>
    </div>
  );
}

/** Equity curve visualization with recharts */
function EquityCurve({ points }: { points: { date: string; cumulativeR: number; tradeR: number }[] }) {
  const isPositive = (points[points.length - 1]?.cumulativeR ?? 0) >= 0;
  const gradientId = "equityGradient";
  const lineColor = isPositive ? "#34d399" : "#f87171";
  const fillColor = isPositive ? "#34d399" : "#f87171";

  return (
    <div className="mt-8 rounded-xl border border-white/5 bg-white/[0.02] p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Equity Curve
          </p>
          <p className="mt-0.5 text-sm text-zinc-400">
            Cumulative R-multiple · one point per graded trade
          </p>
        </div>
        <div className="text-right">
          <p
            className={`font-mono text-2xl font-semibold tabular-nums ${
              isPositive ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}{(points[points.length - 1]?.cumulativeR ?? 0).toFixed(2)}R
          </p>
          <p className="text-xs text-zinc-500">{points.length} trades</p>
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
            tick={{ fill: "#71717a", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`}
            tick={{ fill: "#71717a", fontSize: 11, fontFamily: "monospace" }}
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

export default function TrackRecord() {
  const { data: trpcTr, isLoading: isTrpcLoading } = trpc.signals.trackRecord.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const funnel = trpc.signals.funnel.useQuery();
  const { supabaseSignals } = useSupabaseSignals();

  const fallbackTrack = computeTrackFromSignals(supabaseSignals);
  const tr = trpcTr ?? (supabaseSignals.length > 0 ? fallbackTrack : undefined);
  const isLoading = isTrpcLoading && supabaseSignals.length === 0;

  const winRateAccent: "green" | "amber" | "red" | "neutral" =
    !tr || tr.closed === 0 || tr.winRate == null
      ? "neutral"
      : tr.winRate > 0.55
      ? "green"
      : tr.winRate >= 0.40
      ? "amber"
      : "red";

  return (
    <Layout>
      <section className="py-10">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          Transparency
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Track record
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Computed live from the ledger. Only market-graded outcomes — a
          take-profit, stop-loss or break-even actually touched on the tape —
          enter these numbers. Expired setups never do.
        </p>

        {isLoading && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
            <EquityCurveSkeleton />
          </>
        )}

        {tr && (
          <>
            {/* ── Empty state ── */}
            {tr.closed === 0 && (
              <div className="mt-8 rounded-xl border border-dashed border-white/10 p-6 text-sm leading-relaxed text-zinc-400">
                The ledger is young — no signal has been graded by the market yet.
                These numbers fill in automatically as the tape reaches entry,
                target and stop levels. An honest zero beats an invented hundred.
              </div>
            )}

            {/* ── Metric cards ── */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Graded outcomes"
                value={String(tr.closed)}
                sub={`${tr.undecidable} undecidable · ${tr.expired} expired (excluded)`}
              />
              <StatCard
                label="Win rate"
                value={tr.closed > 0 ? pct(tr.winRate) : "—"}
                sub={`${tr.wins} wins · ${tr.nonWins} non-wins`}
                accent={winRateAccent}
              />
              <StatCard
                label="Total R"
                value={formatR(tr.totalR)}
                sub={tr.avgR !== null ? `avg ${formatR(tr.avgR)} per trade` : undefined}
                accent={tr.totalR > 0 ? "green" : tr.totalR < 0 ? "red" : "neutral"}
              />
              <StatCard
                label="Profit factor"
                value={tr.profitFactor !== null ? tr.profitFactor.toFixed(2) : "—"}
                sub={`best streak ${tr.bestStreak} · current ${tr.currentStreak > 0 ? "+" : ""}${tr.currentStreak}`}
              />
            </div>

            {/* ── Equity curve ── */}
            {tr.closed >= EQUITY_CURVE_MIN_TRADES && tr.equityCurve ? (
              <EquityCurve points={tr.equityCurve} />
            ) : tr.closed > 0 && tr.closed < EQUITY_CURVE_MIN_TRADES ? (
              <div className="mt-8 rounded-xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">
                Equity curve appears after {EQUITY_CURVE_MIN_TRADES} graded trades.{" "}
                <span className="text-zinc-400">{EQUITY_CURVE_MIN_TRADES - tr.closed} more to go.</span>
              </div>
            ) : null}

            {/* ── By-month table ── */}
            {tr.byMonth && tr.byMonth.length > 0 && (
              <div className="mt-10 overflow-hidden rounded-xl border border-white/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-5 py-3 font-medium">Month</th>
                      <th className="px-5 py-3 font-medium">Closed</th>
                      <th className="px-5 py-3 font-medium">Wins</th>
                      <th className="px-5 py-3 font-medium">Win rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tr.byMonth.map((m: any) => (
                      <tr key={m.month} className="border-b border-white/5 last:border-0">
                        <td className="px-5 py-3 font-mono text-zinc-300">{m.month}</td>
                        <td className="px-5 py-3 font-mono text-zinc-300">{m.closed}</td>
                        <td className="px-5 py-3 font-mono text-zinc-300">{m.wins}</td>
                        <td className="px-5 py-3 font-mono text-emerald-400">{pct(m.winRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── By-market table ── */}
            {tr.byMarket && tr.byMarket.length > 0 && (
              <div className="mt-6 overflow-hidden rounded-xl border border-white/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-5 py-3 font-medium">Market</th>
                      <th className="px-5 py-3 font-medium">Closed</th>
                      <th className="px-5 py-3 font-medium">Wins</th>
                      <th className="px-5 py-3 font-medium">Win rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tr.byMarket.map((m: any) => (
                      <tr key={m.market} className="border-b border-white/5 last:border-0">
                        <td className="px-5 py-3 capitalize text-zinc-300">{m.market}</td>
                        <td className="px-5 py-3 font-mono text-zinc-300">{m.closed}</td>
                        <td className="px-5 py-3 font-mono text-zinc-300">{m.wins}</td>
                        <td className="px-5 py-3 font-mono text-emerald-400">{pct(m.winRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Audit funnel ── */}
        {funnel.data && (
          <div className="mt-10 rounded-xl border border-white/5 bg-white/[0.03] p-6">
            <h2 className="font-medium text-white">The audit funnel — last 7 days</h2>
            <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-sm">
              <span className="rounded-lg bg-white/5 px-3 py-2 text-zinc-300">
                {funnel.data.scans} scans
              </span>
              <span className="text-zinc-600">→</span>
              <span className="rounded-lg bg-white/5 px-3 py-2 text-zinc-300">
                {funnel.data.candidates} candidates
              </span>
              <span className="text-zinc-600">→</span>
              <span className="rounded-lg bg-emerald-500/15 px-3 py-2 text-emerald-300">
                {funnel.data.published} published
              </span>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Most scans produce nothing and most candidates fail the gate. That
              selectivity is the product.
            </p>
          </div>
        )}

        <p className="mt-8 text-sm text-zinc-500">
          Want the counting rules in full? Read the{" "}
          <Link to="/methodology" className="text-emerald-400 hover:text-emerald-300">
            methodology
          </Link>
          .
        </p>
      </section>
    </Layout>
  );
}
