import Layout from "@/components/Layout";
import SignalCard from "@/components/SignalCard";
import { trpc } from "@/providers/trpc";
import { supabase } from "@/utils/supabase";
import { INSTRUMENTS, type SignalStatus } from "@contracts/instruments";
import type { Signal } from "@db/schema";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const STATUS_TABS: { value: SignalStatus | "all" | "closed"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Live" },
  { value: "closed", label: "Graded" },
  { value: "expired", label: "Expired" },
];

export default function Signals() {
  const [symbol, setSymbol] = useState<string | undefined>();
  const [tab, setTab] = useState<"all" | SignalStatus | "closed">("all");
  const [supabaseSignals, setSupabaseSignals] = useState<Signal[]>([]);

  const query = trpc.signals.list.useQuery(
    {
      symbol,
      status: tab === "all" || tab === "closed" ? undefined : tab,
      closedOnly: tab === "closed" ? true : undefined,
      limit: 100,
    },
    { refetchInterval: 60_000 },
  );

  useEffect(() => {
    async function fetchFromSupabase() {
      try {
        let q = supabase.from("signals").select("*").order("id", { ascending: false });
        if (symbol) {
          q = q.eq("symbol", symbol);
        }
        if (tab === "closed") {
          q = q.not("status", "in", "(open,expired)");
        } else if (tab !== "all") {
          q = q.eq("status", tab);
        }
        const { data, error } = await q;
        if (data && !error) {
          setSupabaseSignals(data as unknown as Signal[]);
        }
      } catch (err) {
        console.error("Supabase fetch error:", err);
      }
    }
    fetchFromSupabase();
  }, [symbol, tab]);

  const displaySignals = (query.data && query.data.length > 0) ? query.data : supabaseSignals;
  const isLoading = query.isLoading && supabaseSignals.length === 0;

  return (
    <Layout>
      <section className="py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Signal feed</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Published setups from the engine across all covered markets. Signals
          are graded against the candle tape and never removed from the ledger.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                tab === t.value
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-white/10 text-zinc-400 hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-2 h-5 w-px bg-white/10" />
          <button
            onClick={() => setSymbol(undefined)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 font-mono text-sm transition-colors",
              !symbol
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 text-zinc-400 hover:text-white",
            )}
          >
            All markets
          </button>
          {INSTRUMENTS.map((i) => (
            <button
              key={i.symbol}
              onClick={() => setSymbol(i.symbol)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 font-mono text-sm transition-colors",
                symbol === i.symbol
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-white/10 text-zinc-400 hover:text-white",
              )}
            >
              {i.symbol}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-4">
          {isLoading && (
            <p className="py-16 text-center text-sm text-zinc-500">
              Loading the ledger…
            </p>
          )}
          {!isLoading && displaySignals.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 py-16 text-center text-sm text-zinc-500">
              No signals match this filter yet. The gate only publishes when a
              setup clears every check — an empty feed is the gate doing its job.
            </p>
          )}
          {displaySignals.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      </section>
    </Layout>
  );
}
