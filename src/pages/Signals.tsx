import { useEffect, useState, useMemo } from "react";
import Layout from "@/components/Layout";
import SignalCard from "@/components/SignalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useSupabaseSignals } from "@/hooks/useSupabaseSignals";
import { INSTRUMENTS, type Market } from "@contracts/instruments";
import { cn } from "@/lib/utils";

function SignalCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-2.5 w-8" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS: Array<{ id: "open" | "history"; label: string }> = [
  { id: "open", label: "Live Signals" },
  { id: "history", label: "History" },
];

const MARKETS: Array<{ id: Market | "all"; label: string }> = [
  { id: "all", label: "All Markets" },
  { id: "crypto", label: "Crypto" },
  { id: "gold", label: "Gold" },
  { id: "forex", label: "Forex" },
];

export default function Signals() {
  useEffect(() => {
    document.title = "Live Signal Feed — KR-Signal";
  }, []);

  const [marketCategory, setMarketCategory] = useState<Market | "all">("all");
  const [symbol, setSymbol] = useState<string | undefined>();
  const [tab, setTab] = useState<"open" | "history">("open");

  const query = trpc.signals.list.useQuery(
    {
      symbol,
      status: tab === "open" ? "open" : undefined,
      historyOnly: tab === "history" ? true : undefined,
      limit: 100,
    },
    {
      refetchInterval: 5_000,
    },
  );

  const { supabaseSignals } = useSupabaseSignals({
    symbol,
    status: tab === "open" ? "open" : undefined,
    historyOnly: tab === "history",
  });

  const rawSignals = query.data && query.data.length > 0 ? query.data : supabaseSignals;

  const displaySignals = useMemo(() => {
    if (!rawSignals) return [];
    if (marketCategory === "all") return rawSignals;
    return rawSignals.filter((s) => s.market === marketCategory);
  }, [rawSignals, marketCategory]);

  const symbolOptions = useMemo(() => {
    if (marketCategory === "all") return INSTRUMENTS;
    return INSTRUMENTS.filter((i) => i.market === marketCategory);
  }, [marketCategory]);

  const isLoadingSignals = query.isLoading && supabaseSignals.length === 0;

  return (
    <Layout>
      <section className="py-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Signal feed
            </h1>
            <p className="mt-2 max-w-2xl text-base text-zinc-400">
              Published setups across all covered markets. Every signal is graded against candle tape and kept permanently in the ledger.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5 text-xs text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span>Live Feed · Auto-Refreshing</span>
          </div>
        </div>

        {/* Filters bar */}
        <div className="mt-8 space-y-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          {/* Top row: Market categories & Symbol picker */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Market Category Pills */}
            <div className="flex flex-wrap gap-1">
              {MARKETS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMarketCategory(m.id);
                    setSymbol(undefined);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer",
                    marketCategory === m.id
                      ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Symbol Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400 hidden sm:inline">Symbol:</span>
              <select
                value={symbol ?? ""}
                onChange={(e) => setSymbol(e.target.value ? e.target.value : undefined)}
                className="rounded-lg border border-white/10 bg-[#0c120e] px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-hidden"
              >
                <option value="">All symbols</option>
                {symbolOptions.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.symbol} ({i.name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bottom row: Live vs historical signal views */}
          <div className="flex overflow-x-auto gap-1 border-t border-white/5 pt-3 scrollbar-none">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer",
                  tab === t.id
                    ? "bg-white/15 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Signals Grid */}
        <div className="mt-6 space-y-4">
          {isLoadingSignals ? (
            Array.from({ length: 4 }).map((_, i) => <SignalCardSkeleton key={i} />)
          ) : displaySignals && displaySignals.length > 0 ? (
            displaySignals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))
          ) : (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-12 text-center">
              <p className="text-sm font-medium text-zinc-400">No {tab === "open" ? "live" : "historical"} signals found matching filters</p>
              <p className="mt-1 text-xs text-zinc-500">
                Try selecting a different market category or symbol.
              </p>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
