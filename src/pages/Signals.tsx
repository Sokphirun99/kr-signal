import Layout from "@/components/Layout";
import SignalCard from "@/components/SignalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useSupabaseSignals } from "@/hooks/useSupabaseSignals";
import { INSTRUMENTS, type SignalStatus } from "@contracts/instruments";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Mirrors the SignalCard shell — header row + levels grid + footer */
function SignalCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      {/* Header */}
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
      {/* Price levels grid */}
      <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-2.5 w-8" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

const STATUS_TABS: { value: SignalStatus | "all" | "closed"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Live" },
  { value: "closed", label: "Graded" },
  { value: "expired", label: "Expired" },
];

export default function Signals() {
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
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <SignalCardSkeleton key={i} />
              ))}
            </>
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
