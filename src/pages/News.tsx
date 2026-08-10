import { useEffect, useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { NewsList, NewsListSkeleton } from "@/components/news/NewsList";
import { useNews } from "@/lib/data/useNews";
import { INSTRUMENTS, type Market } from "@contracts/instruments";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

const MARKETS: Array<{ id: Market | "all"; label: string }> = [
  { id: "all", label: "All Markets" },
  { id: "crypto", label: "Crypto" },
  { id: "gold", label: "Gold" },
  { id: "forex", label: "Forex" },
];

/**
 * Dedicated Market News page displaying third-party RSS headlines filtered by category and symbol.
 * Educational context only — does not influence rules-based signals.
 * Inputs: none.
 * Outputs: React JSX page component.
 * Side effects: updates document title and queries news hook.
 * Failure modes: renders graceful empty state when feeds are unreachable.
 */
export default function News() {
  useEffect(() => {
    document.title = "Market News — KR-Signal";
  }, []);

  const [marketCategory, setMarketCategory] = useState<Market | "all">("all");
  const [symbol, setSymbol] = useState<string | undefined>();

  const selectedMarket = marketCategory === "all" ? undefined : marketCategory;

  const { news, isLoading, isError } = useNews({
    symbol,
    market: selectedMarket,
    limit: 60,
  });

  const symbolOptions = useMemo(() => {
    if (marketCategory === "all") return INSTRUMENTS;
    return INSTRUMENTS.filter(i => i.market === marketCategory);
  }, [marketCategory]);

  return (
    <Layout>
      <section className="py-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Market news — context, not signals
            </h1>
            <p className="mt-2 max-w-2xl text-base text-zinc-400">
              Headlines are third-party context only — they never influence
              signal publication or grading.
            </p>
          </div>
        </div>

        {/* Disclaimer Callout */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300/90">
          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <p className="leading-relaxed">
            KR-Signal executes a purely rules-based algorithmic engine. External
            news headlines, sentiment, and narratives are provided solely for
            trader awareness and never enter signal generation, stop
            calculation, or verified ledger grading.
          </p>
        </div>

        {/* Filters Bar (reusing the exact filter bar pattern from Signals.tsx) */}
        <div className="mt-6 space-y-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Market Category Pills */}
            <div className="flex flex-wrap gap-1">
              {MARKETS.map(m => (
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
                      : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
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
                onChange={e =>
                  setSymbol(e.target.value ? e.target.value : undefined)
                }
                className="rounded-lg border border-white/10 bg-[#0c120e] px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-hidden"
              >
                <option value="">All symbols</option>
                {symbolOptions.map(i => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.symbol} ({i.name})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Headlines List Feed */}
        <div className="mt-6">
          {isLoading ? (
            <NewsListSkeleton />
          ) : isError ? (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center">
              <p className="text-sm font-medium text-zinc-400">
                Unable to load news feed at this moment.
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                The application will automatically retry fetching the headlines
                shortly.
              </p>
            </div>
          ) : (
            <NewsList
              key={`${marketCategory}:${symbol ?? "all"}`}
              items={news}
            />
          )}
        </div>
      </section>
    </Layout>
  );
}
