import { useEffect } from "react";
import Layout from "@/components/Layout";
import StatCard from "@/components/StatCard";
import DataSourceBadge from "@/components/DataSourceBadge";
import { useTrackRecord } from "@/lib/data/useTrackRecord";
import { Link } from "react-router";
import {
  StatCardSkeleton,
  EquityCurveSkeleton,
} from "@/components/track-record/TrackRecordSkeletons";
import { EquityCurve } from "@/components/track-record/EquityCurve";
import { BreakdownTable } from "@/components/track-record/BreakdownTable";

const EQUITY_CURVE_MIN_TRADES = 3;

function pct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

function formatR(val: number | null): string {
  if (val === null) return "—";
  return `${val > 0 ? "+" : ""}${val.toFixed(2)}R`;
}

/**
 * Public verified track record page showing market-graded win rates and equity progression.
 * Inputs: none (reads from useTrackRecord hook).
 * Outputs: React JSX page.
 * Side effects: sets document title.
 * Failure modes: renders graceful empty states and snapshot recovery indicators.
 */
export default function TrackRecord() {
  useEffect(() => {
    document.title = "Verified Track Record — KR-Signal";
  }, []);

  const {
    trackRecord: tr,
    funnel: funnelData,
    isLoading,
    source,
  } = useTrackRecord();

  const isSnapshotMode = source === "snapshot";
  const closedCount = tr?.closed ?? 0;
  const isSampleMeaningful = closedCount >= 10;

  const winRateAccent: "green" | "amber" | "red" | "neutral" =
    !isSampleMeaningful || !tr || tr.closed === 0 || tr.winRate == null
      ? "neutral"
      : tr.winRate > 0.55
        ? "green"
        : tr.winRate >= 0.4
          ? "amber"
          : "red";

  const winRateSub =
    closedCount === 0
      ? "awaiting first outcomes"
      : !isSampleMeaningful
        ? `n=${closedCount} · sample building (target n≥10)`
        : `${tr?.wins} wins · ${tr?.nonWins} non-wins`;

  const monthlyRows =
    tr?.byMonth?.map(m => ({
      key: m.month,
      label: m.month,
      closed: m.closed,
      wins: m.wins,
      winRate: m.winRate,
    })) ?? [];

  const marketRows =
    tr?.byMarket?.map(m => ({
      key: m.market,
      label: m.market,
      closed: m.closed,
      wins: m.wins,
      winRate: m.winRate,
    })) ?? [];

  return (
    <Layout>
      <section className="py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
              Transparency
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Verified track record
            </h1>
          </div>
          <DataSourceBadge
            mode={isSnapshotMode ? "snapshot" : "live"}
            liveLabel="Updated live · Timestamps UTC"
            snapshotLabel="Snapshot · retrying"
          />
        </div>

        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
          Computed live from the public ledger. Only market-graded outcomes — a
          take-profit, stop-loss or break-even actually touched on the candle
          tape — enter these numbers. Expired setups never do.
        </p>

        {isSnapshotMode && (
          <p className="mt-3 text-xs text-zinc-500">
            Live connection interrupted — showing a snapshot. Retrying
            automatically.
          </p>
        )}

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
            {/* Empty state note */}
            {tr.closed === 0 && (
              <div className="mt-8 rounded-xl border border-dashed border-white/15 bg-white/[0.01] p-6 text-sm leading-relaxed text-zinc-400">
                The ledger is young — no signal has been graded by the market
                tape yet. These numbers fill in automatically as prices hit
                entry, target and stop levels. An honest zero beats an invented
                hundred.
              </div>
            )}

            {/* Metric cards */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Graded outcomes"
                value={String(tr.closed)}
                sub={`${tr.undecidable} undecidable · ${tr.expired} expired (excluded)`}
              />
              <StatCard
                label="Win rate"
                value={tr.closed > 0 ? pct(tr.winRate) : "—"}
                sub={winRateSub}
                accent={winRateAccent}
              />
              <StatCard
                label="Total R"
                value={formatR(tr.totalR)}
                sub={
                  tr.avgR !== null
                    ? `avg ${formatR(tr.avgR)} per trade`
                    : undefined
                }
                accent={
                  tr.totalR > 0 ? "green" : tr.totalR < 0 ? "red" : "neutral"
                }
              />
              <StatCard
                label="Profit factor"
                value={
                  !isSampleMeaningful
                    ? "—"
                    : tr.profitFactor !== null
                      ? tr.profitFactor.toFixed(2)
                      : "—"
                }
                sub={
                  !isSampleMeaningful
                    ? `n=${closedCount} · unlocks at n≥10`
                    : `best streak ${tr.bestStreak} · current ${
                        tr.currentStreak > 0 ? "+" : ""
                      }${tr.currentStreak}`
                }
              />
            </div>

            {/* Equity curve */}
            {tr.closed >= EQUITY_CURVE_MIN_TRADES && tr.equityCurve ? (
              <EquityCurve points={tr.equityCurve} />
            ) : tr.closed > 0 && tr.closed < EQUITY_CURVE_MIN_TRADES ? (
              <div className="mt-8 rounded-xl border border-dashed border-white/15 bg-white/[0.01] p-5 text-sm text-zinc-400">
                Equity curve appears after {EQUITY_CURVE_MIN_TRADES} graded
                trades.{" "}
                <span className="text-zinc-300 font-medium">
                  {EQUITY_CURVE_MIN_TRADES - tr.closed} more to go.
                </span>
              </div>
            ) : null}

            {/* By-month table */}
            <BreakdownTable
              title="Monthly Breakdown"
              labelHeader="Month (UTC)"
              rows={monthlyRows}
              showSampleSizeUnder10
            />

            {/* By-market table */}
            <BreakdownTable
              title="Market Breakdown"
              labelHeader="Market"
              rows={marketRows}
              isCapitalized
            />
          </>
        )}

        {/* Audit funnel visual */}
        {funnelData && (
          <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-6 shadow-xs">
            <h2 className="font-semibold text-white text-base">
              The Audit Funnel — Last 7 Days
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-sm">
              <span className="rounded-lg border border-white/10 bg-black/30 px-3.5 py-2 text-zinc-200 tabular-nums">
                {funnelData.scans} scans
              </span>
              <span className="text-zinc-500 font-sans">→</span>
              <span className="rounded-lg border border-white/10 bg-black/30 px-3.5 py-2 text-zinc-200 tabular-nums">
                {funnelData.candidates} candidates
              </span>
              <span className="text-zinc-500 font-sans">→</span>
              <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2 text-emerald-300 font-bold tabular-nums">
                {funnelData.published} published
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Most candidate setups fail our strict confluence and risk-geometry
              gates. Scarcity and strict filtering protect signal quality.
            </p>
          </div>
        )}

        <p className="mt-8 text-sm text-zinc-400">
          Want the counting rules in full? Read our{" "}
          <Link
            to="/methodology"
            className="font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
          >
            methodology & rules
          </Link>
          .
        </p>
      </section>
    </Layout>
  );
}
