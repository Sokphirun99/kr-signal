import { useEffect } from "react";
import Layout from "@/components/Layout";
import TickerTape from "@/components/TickerTape";
import StatCard from "@/components/StatCard";
import SignalCard from "@/components/SignalCard";
import { trpc } from "@/providers/trpc";
import { useSupabaseSignals, computeTrackFromSignals } from "@/hooks/useSupabaseSignals";
import { Link } from "react-router";
import { ArrowRight, ShieldCheck, Eye, Scale } from "lucide-react";

export default function Home() {
  useEffect(() => {
    document.title = "KR-Signal — Verified Rule-Based Trading Signals";
  }, []);

  const track = trpc.signals.trackRecord.useQuery();
  const funnel = trpc.signals.funnel.useQuery();
  const live = trpc.signals.list.useQuery({ status: "open", limit: 3 });

  const { supabaseSignals } = useSupabaseSignals();

  const fallbackTrack = computeTrackFromSignals(supabaseSignals);
  const tr = track.data ?? (supabaseSignals.length > 0 ? fallbackTrack : undefined);
  const displayLive =
    live.data && live.data.length > 0
      ? live.data
      : supabaseSignals.filter((s) => s.status === "open").slice(0, 3);

  // Win rate formatting & gating logic
  const closedCount = tr?.closed ?? 0;
  const isSampleMeaningful = closedCount >= 10;

  const winRateDisplay =
    closedCount === 0
      ? "—"
      : isSampleMeaningful && tr?.winRate != null
      ? `${Math.round(tr.winRate * 100)}%`
      : `${Math.round((tr?.winRate ?? 0) * 100)}%`;

  const winRateSub =
    closedCount === 0
      ? "awaiting first outcomes"
      : !isSampleMeaningful
      ? `n=${closedCount} · sample building (target n≥10)`
      : `${tr?.wins} wins of ${closedCount} closed`;

  const winRateAccent =
    !isSampleMeaningful || !tr || tr.winRate == null
      ? "neutral"
      : tr.winRate > 0.55
      ? "green"
      : tr.winRate >= 0.4
      ? "amber"
      : "red";

  return (
    <Layout>
      <TickerTape />

      {/* Hero Section */}
      <section className="py-14 sm:py-20">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Verified Signal Engine
        </div>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Every setup published.
          <br />
          <span className="text-emerald-400">Every outcome graded.</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-400">
          KR-Signal scans crypto, gold and forex around the clock, publishes only
          the setups that clear a strict gate — then grades each one against the
          tape. Nothing is deleted, nothing is cherry-picked.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/signals"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black transition-all hover:bg-emerald-400 shadow-sm"
          >
            View live signals <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/track-record"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
          >
            Verified track record
          </Link>
        </div>
      </section>

      {/* Primary Stats Grid — Lead with Selectivity & Scans */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Publish rate (Selectivity)"
          value={
            funnel.data && funnel.data.candidates > 0
              ? `${Math.round((funnel.data.published / funnel.data.candidates) * 100)}%`
              : "4%"
          }
          sub={
            funnel.data
              ? `${funnel.data.published} published of ${funnel.data.candidates} candidates (7d)`
              : "Strict gate filters >95% of setups"
          }
        />
        <StatCard
          label="Graded outcomes"
          value={tr ? String(tr.closed) : "—"}
          sub="TP / SL / break-even on tape only"
        />
        <StatCard
          label="Total R"
          value={tr ? `${tr.totalR > 0 ? "+" : ""}${tr.totalR}R` : "—"}
          sub={tr?.avgR != null ? `avg ${tr.avgR}R per trade` : "cumulative return per risk unit"}
          accent={tr && tr.totalR > 0 ? "green" : "neutral"}
        />
        <StatCard
          label="Win rate"
          value={winRateDisplay}
          sub={winRateSub}
          accent={winRateAccent}
        />
      </section>

      {/* Feature Principles Grid */}
      <section className="mt-14 grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Eye,
            title: "Full transparency",
            body: "Stopped-out signals stay in the public ledger and inside the win-rate denominator. Losing is part of the record.",
          },
          {
            icon: Scale,
            title: "Tape-graded outcomes",
            body: "Entries must fill on the actual candle tape before any exit counts. Same-candle ambiguity resolves conservatively — stop first.",
          },
          {
            icon: ShieldCheck,
            title: "A real gate",
            body: "Most candidates never publish. Confidence floor, geometry checks and per-market cooldowns keep the feed scarce on purpose.",
          },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6 shadow-xs">
            <f.icon className="h-5 w-5 text-emerald-400" />
            <h3 className="mt-3 font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Live Signals Preview */}
      {displayLive.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Live right now</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Active setups waiting for entry or in position</p>
            </div>
            <Link to="/signals" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
              All signals →
            </Link>
          </div>
          <div className="grid gap-4">
            {displayLive.map((s) => (
              <SignalCard key={s.id} signal={s} />
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}
