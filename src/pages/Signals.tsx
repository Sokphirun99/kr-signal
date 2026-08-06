import { useEffect, useState, useMemo } from "react";
import Layout from "@/components/Layout";
import SignalCard from "@/components/SignalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useSupabaseSignals } from "@/hooks/useSupabaseSignals";
import { INSTRUMENTS, type SignalStatus, type Market } from "@contracts/instruments";
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
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

const STATUS_TABS: { value: SignalStatus | "all" | "closed"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Live" },
  { value: "closed", label: "Graded" },
  { value: "expired", label: "Expired" },
];

const MARKET_TABS: { value: Market | "all"; label: string }[] = [
  { value: "all", label: "All Markets" },
  { value: "crypto", label: "Crypto" },
  { value: "gold", label: "Gold" },
  { value: "forex", label: "Forex" },
];

export default function Signals() {
  useEffect(() => {
    document.title = "Live Signal Feed — KR-Signal";
  }, []);

  const [marketCategory, setMarketCategory] = useState<Market | "all">("all");
  const [symbol, setSymbol] = useState<string | undefined>();
  const [tab, setTab] = useState<"all" | SignalStatus | "closed">("all");

  const query = trpc.signals.list.useQuery(
    {
      symbol,
      status: tab === "all" || tab === "closed" ? undefined : tab,
      closedOnly: tab === "closed" ? true : undefined,
      limit: 100,
    },
    { refetchInterval: 60_000 },
  );

  const { supabaseSignals } = useSupabaseSignals({
    symbol,
    status: tab,
    closedOnly: tab === "closed",
  });

  const rawSignals = query.data && query.data.length > 0 ? query.data : supabaseSignals;

  const displaySignals = useMemo(() => {
    if (marketCategory === "all") return rawSignals;
    return rawSignals.filter((s) => s.market === marketCategory);
  }, [rawSignals, marketCategory]);

  const filteredInstruments = useMemo(() => {
    if (marketCategory === "all") return INSTRUMENTS;
    return INSTRUMENTS.filter((i) => i.market === marketCategory);
  }, [marketCategory]);

  const isLoading = query.isLoading && supabaseSignals.length === 0;

  return (
    <Layout>
      <section className="py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Signal feed</h1>
            <p className="mt-2 max-w-2xl text-base text-zinc-400">
              Published setups across all covered markets. Every signal is graded against candle tape and kept permanently in the ledger.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5 text-xs text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span>Live Feed · Auto-Refreshing</span>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-8 space-y-3 border-b border-white/10 pb-5">
          {/* Top Row: Status & Market Category Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Status:</span>
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1 text-xs font-medium transition-all",
                  tab === t.value
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-2xs"
                    : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white",
                )}
              >
                {t.label}
              </button>
            ))}

            <span className="mx-2 h-4 w-px bg-white/10" />

            <span className="mr-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Category:</span>
            {MARKET_TABS.map((m) => (
              <button
                key={m.value}
                onClick={() => {
                  setMarketCategory(m.value);
                  setSymbol(undefined);
                }}
                className={cn(
                  "rounded-full border px-3.5 py-1 text-xs font-medium transition-all",
                  marketCategory === m.value
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-2xs"
                    : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Bottom Row: Individual Asset Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              onClick={() => setSymbol(undefined)}
              className={cn(
                "rounded-md border px-3 py-1 font-mono text-xs font-medium transition-all",
                !symbol
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white",
              )}
            >
              All Assets
            </button>
            {filteredInstruments.map((i) => (
              <button
                key={i.symbol}
                onClick={() => setSymbol(i.symbol)}
                className={cn(
                  "rounded-md border px-3 py-1 font-mono text-xs font-medium transition-all",
                  symbol === i.symbol
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white",
                )}
              >
                {i.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Signal Cards Feed */}
        <div className="mt-8 grid gap-4">
          {isLoading && (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <SignalCardSkeleton key={i} />
              ))}
            </>
          )}
          {!isLoading && displaySignals.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.01] py-16 px-6 text-center">
              <p className="text-base font-medium text-white">No signals match this filter right now</p>
              <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
                Our rule engine gates setup candidates strictly. When market conditions align, new setups publish automatically.
              </p>
            </div>
          )}
          {displaySignals.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      </section>
    </Layout>
  );
}
