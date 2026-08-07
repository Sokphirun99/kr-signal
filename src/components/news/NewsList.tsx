import type { NewsItem } from "@contracts/news";
import { InstrumentLogo } from "@/components/signals/InstrumentLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Calculates human-readable relative time from a UTC timestamp.
 * Inputs: ISO UTC date string.
 * Outputs: relative string (e.g. "15m ago", "2h ago", "1d ago").
 * Side effects: none.
 * Failure modes: returns "recently" on parse failure.
 */
export function formatRelativeTime(dateStr: string): string {
  const parsed = new Date(dateStr).getTime();
  if (isNaN(parsed)) return "recently";

  const diffMs = Math.max(0, Date.now() - parsed);
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Returns distinct badge styling for known news publishers.
 * Inputs: source name string.
 * Outputs: CSS class string.
 * Side effects: none.
 * Failure modes: default fallback badge style.
 */
function getSourceBadgeClass(source: string): string {
  const normalized = source.toLowerCase();
  if (normalized.includes("coindesk")) {
    return "bg-amber-500/15 text-amber-300 border-amber-500/25";
  }
  if (normalized.includes("cointelegraph")) {
    return "bg-yellow-500/15 text-yellow-300 border-yellow-500/25";
  }
  if (normalized.includes("decrypt")) {
    return "bg-cyan-500/15 text-cyan-300 border-cyan-500/25";
  }
  return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
}

export function NewsListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/5 bg-white/[0.03] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24 rounded-md" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface NewsListProps {
  items: NewsItem[];
  emptyMessage?: string;
}

/**
 * Displays a list of verified news headline items with publisher badges and matched symbols.
 * Inputs: NewsItem array and optional empty message.
 * Outputs: React JSX news feed.
 * Side effects: none.
 * Failure modes: renders empty state when items array is empty.
 */
export function NewsList({ items, emptyMessage = "No recent headlines for this filter." }: NewsListProps) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center">
        <Newspaper className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
        <p className="text-sm font-medium text-zinc-400">{emptyMessage}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Third-party RSS headlines refresh periodically as publications issue market updates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.05]"
        >
          {/* Header Row: Source Badge & Relative Time */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 font-medium",
                getSourceBadgeClass(item.source),
              )}
            >
              {item.source}
            </span>
            <time dateTime={item.publishedAt} className="font-mono text-zinc-400">
              {formatRelativeTime(item.publishedAt)}
            </time>
          </div>

          <div className="mt-2 flex flex-col sm:flex-row items-start gap-3 justify-between">
            <div className="flex-1 min-w-0">
              {/* Title Link */}
              <h2 className="text-sm font-medium leading-snug text-white">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1.5 hover:text-emerald-400 transition-colors"
                >
                  <span>{item.title}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100 group-hover:text-emerald-400 transition-opacity mt-0.5" />
                </a>
              </h2>

              {/* Summary */}
              {item.summary && (
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400 line-clamp-2">
                  {item.summary}
                </p>
              )}
            </div>

            {/* Optional Thumbnail */}
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                className="h-16 w-24 rounded-lg border border-white/10 object-cover bg-white/5 shrink-0"
              />
            )}
          </div>

          {/* Matched Symbols Chips */}
          {item.matchedSymbols.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
              <span className="text-[11px] text-zinc-400 font-mono">Related:</span>
              {item.matchedSymbols.map((symbol) => (
                <span
                  key={symbol}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
                >
                  <InstrumentLogo symbol={symbol} />
                  <span>{symbol}</span>
                </span>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
