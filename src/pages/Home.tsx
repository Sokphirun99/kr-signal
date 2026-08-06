import Layout from "@/components/Layout";
import TickerTape from "@/components/TickerTape";
import StatCard from "@/components/StatCard";
import SignalCard from "@/components/SignalCard";
import { trpc } from "@/providers/trpc";
import { useSupabaseSignals, computeTrackFromSignals } from "@/hooks/useSupabaseSignals";
import { Link } from "react-router";
import { ArrowRight, ShieldCheck, Eye, Scale } from "lucide-react";

export default function Home() {
  const track = trpc.signals.trackRecord.useQuery();
  const funnel = trpc.signals.funnel.useQuery();
  const live = trpc.signals.list.useQuery({ status: "open", limit: 3 });

  const { supabaseSignals } = useSupabaseSignals();

  const fallbackTrack = computeTrackFromSignals(supabaseSignals);
  const tr = track.data ?? (supabaseSignals.length > 0 ? fallbackTrack : undefined);
  const displayLive = (live.data && live.data.length > 0)
    ? live.data
    : supabaseSignals.filter((s) => s.status === "open").slice(0, 3);


  return (
    <Layout>
      <TickerTape />

      <section className="py-16 sm:py-20">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          Verified signal engine
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Every setup published.
          <br />
          Every outcome graded.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-400">
          KR-Signal scans crypto, gold and forex around the clock, publishes only
          the setups that clear a strict gate — then grades each one against the
          tape. Nothing is deleted, nothing is cherry-picked.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/signals"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-emerald-400"
          >
            View live signals <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/track-record"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5"
          >
            Verified track record
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Graded outcomes"
          value={tr ? String(tr.closed) : "—"}
          sub="TP / SL / break-even only"
        />
        <StatCard
          label="Win rate"
          value={tr?.winRate != null ? `${Math.round(tr.winRate * 100)}%` : "—"}
          sub={tr ? `${tr.wins} wins of ${tr.closed} closed` : "awaiting first outcomes"}
          accent="green"
        />
        <StatCard
          label="Total R"
          value={tr ? `${tr.totalR > 0 ? "+" : ""}${tr.totalR}R` : "—"}
          sub={tr?.avgR != null ? `avg ${tr.avgR}R per trade` : undefined}
          accent={tr && tr.totalR > 0 ? "green" : "neutral"}
        />
        <StatCard
          label="Publish rate"
          value={
            funnel.data && funnel.data.candidates > 0
              ? `${Math.round((funnel.data.published / funnel.data.candidates) * 100)}%`
              : "—"
          }
          sub={
            funnel.data
              ? `${funnel.data.published} of ${funnel.data.candidates} candidates, 7d`
              : undefined
          }
        />
      </section>

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
          <div key={f.title} className="rounded-xl border border-white/5 bg-white/[0.03] p-6">
            <f.icon className="h-5 w-5 text-emerald-400" />
            <h3 className="mt-3 font-medium text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </div>
        ))}
      </section>

      {displayLive.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Live right now</h2>
            <Link to="/signals" className="text-sm text-emerald-400 hover:text-emerald-300">
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
