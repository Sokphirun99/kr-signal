import { trpc } from "@/providers/trpc";
import { formatPrice } from "@contracts/instruments";
import { cn } from "@/lib/utils";

export default function TickerTape() {
  const { data } = trpc.signals.ticker.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 25_000,
  });

  if (!data?.length) return null;

  const items = [...data, ...data, ...data, ...data];

  return (
    <div className="w-full overflow-hidden border-b border-white/10 bg-[#050706]/95 backdrop-blur-md">
      <div className="flex w-max animate-[ticker_40s_linear_infinite] gap-8 px-4 py-2 hover:[animation-play-state:paused]">
        {items.map((t, i) => (
          <div
            key={`${t.symbol}-${i}`}
            className="flex items-center gap-2 font-mono text-xs whitespace-nowrap"
          >
            <span className="font-semibold text-zinc-300">{t.symbol}</span>
            <span className="text-zinc-100">
              {t.lastPrice !== null
                ? formatPrice(t.lastPrice, t.decimals)
                : "—"}
            </span>
            {t.priceChangePct !== null && (
              <span
                className={cn(
                  "font-medium",
                  t.priceChangePct >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                {t.priceChangePct >= 0 ? "+" : ""}
                {t.priceChangePct.toFixed(2)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
