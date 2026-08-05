import Layout from "@/components/Layout";
import StatCard from "@/components/StatCard";
import { trpc } from "@/providers/trpc";
import { supabase } from "@/utils/supabase";
import { Link } from "react-router";
import { useState, useEffect } from "react";

function pct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

function computeTrackFromSignals(signals: any[]) {
  let closed = 0;
  let wins = 0;
  let nonWins = 0;
  let totalR = 0;
  let expired = 0;
  let undecidable = 0;

  for (const s of signals) {
    const status = s.status;
    const r = Number(s.rMultiple ?? s.r_multiple ?? 0);
    if (status === "expired") {
      expired++;
    } else if (status === "undecidable") {
      undecidable++;
    } else if (["tp1", "tp2", "tp3", "sl", "be"].includes(status)) {
      closed++;
      totalR += r;
      if (r > 0) wins++;
      else nonWins++;
    }
  }

  const winRate = closed > 0 ? wins / closed : null;
  const avgR = closed > 0 ? Number((totalR / closed).toFixed(2)) : null;

  return {
    closed,
    wins,
    nonWins,
    winRate,
    totalR: Number(totalR.toFixed(2)),
    avgR,
    expired,
    undecidable,
    profitFactor: null,
    bestStreak: 0,
    currentStreak: 0,
    byMonth: [],
    byMarket: [],
  };
}

export default function TrackRecord() {
  const { data: trpcTr, isLoading: isTrpcLoading } = trpc.signals.trackRecord.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const funnel = trpc.signals.funnel.useQuery();
  const [supabaseSignals, setSupabaseSignals] = useState<any[]>([]);

  useEffect(() => {
    async function fetchFromSupabase() {
      try {
        const { data } = await supabase.from("signals").select("*").order("id", { ascending: false });
        if (data) setSupabaseSignals(data);
      } catch (err) {
        console.error("Supabase fetch error:", err);
      }
    }
    fetchFromSupabase();
  }, []);

  const fallbackTrack = computeTrackFromSignals(supabaseSignals);
  const tr = trpcTr ?? (supabaseSignals.length > 0 ? fallbackTrack : undefined);
  const isLoading = isTrpcLoading && supabaseSignals.length === 0;

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

        {isLoading && <p className="mt-10 text-sm text-zinc-500">Computing…</p>}

        {tr && (
          <>
            {tr.closed === 0 && (
              <div className="mt-8 rounded-xl border border-dashed border-white/10 p-6 text-sm leading-relaxed text-zinc-400">
                The ledger is young — no signal has been graded by the market yet.
                These numbers fill in automatically as the tape reaches entry,
                target and stop levels. An honest zero beats an invented hundred.
              </div>
            )}

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Graded outcomes" value={String(tr.closed)} sub={`${tr.undecidable} undecidable · ${tr.expired} expired (excluded)`} />
              <StatCard label="Win rate" value={pct(tr.winRate)} sub={`${tr.wins} wins · ${tr.nonWins} non-wins`} accent="green" />
              <StatCard
                label="Total R"
                value={`${tr.totalR > 0 ? "+" : ""}${tr.totalR}R`}
                sub={tr.avgR !== null ? `avg ${tr.avgR}R per trade` : undefined}
                accent={tr.totalR > 0 ? "green" : tr.totalR < 0 ? "red" : "neutral"}
              />
              <StatCard
                label="Profit factor"
                value={tr.profitFactor !== null ? String(tr.profitFactor) : "—"}
                sub={`best streak ${tr.bestStreak} · current ${tr.currentStreak > 0 ? "+" : ""}${tr.currentStreak}`}
              />
            </div>

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
