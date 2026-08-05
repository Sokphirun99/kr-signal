import { trpc } from "@/providers/trpc";
import { formatPrice } from "@contracts/instruments";
import { cn } from "@/lib/utils";

export default function TickerTape() {
  const { data } = trpc.signals.ticker.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  if (!data?.length) return null;

  const items = [...data, ...data]; // seamless loop

  return (
    <div className="overflow-hidden border-y border-white/5 bg-black/40">
      <div className="flex w-max animate-[ticker_40s_linear_infinite] gap-10 px-4 py-2.5">
        {items.map((t, i) => (
          <div key={`${t.symbol}-${i}`} className="flex items-center gap-2 font-mono text-xs">
            <span className="text-zinc-400">{t.symbol}</span>
            <span className="text-white">
              {t.lastPrice !== null ? formatPrice(t.lastPrice, t.decimals) : "—"}
            </span>
            {t.priceChangePct !== null && (
              <span
                className={cn(
                  t.priceChangePct >= 0 ? "text-emerald-400" : "text-red-400",
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
