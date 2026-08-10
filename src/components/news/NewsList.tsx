import { useState } from "react";
import type { NewsItem } from "@contracts/news";
import { InstrumentLogo } from "@/components/signals/InstrumentLogo";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink,
  Newspaper,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 10;

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
  if (normalized.includes("·") || normalized.includes("+")) {
    return "bg-purple-500/15 text-purple-300 border-purple-500/25";
  }
  if (normalized.includes("coindesk")) {
    return "bg-amber-500/15 text-amber-300 border-amber-500/25";
  }
  if (normalized.includes("cointelegraph")) {
    return "bg-yellow-500/15 text-yellow-300 border-yellow-500/25";
  }
  if (normalized.includes("decrypt")) {
    return "bg-cyan-500/15 text-cyan-300 border-cyan-500/25";
  }
  if (normalized.includes("cryptopanic")) {
    return "bg-rose-500/15 text-rose-300 border-rose-500/25";
  }
  if (normalized.includes("cryptocompare")) {
    return "bg-blue-500/15 text-blue-300 border-blue-500/25";
  }
  return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
}

export function NewsListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-white/5 bg-white/[0.03] p-4 space-y-2.5"
        >
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
 * Displays a paginated list of verified news headlines (10 per page) with navigation controls.
 * Inputs: NewsItem array and optional empty message.
 * Outputs: React JSX paginated news feed.
 * Side effects: resets page index when items list changes.
 * Failure modes: renders empty state when items array is empty.
 */
export function NewsList({
  items,
  emptyMessage = "No recent headlines for this filter.",
}: NewsListProps) {
  const [currentPage, setCurrentPage] = useState(1);

  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center">
        <Newspaper className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
        <p className="text-sm font-medium text-zinc-400">{emptyMessage}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Third-party headlines refresh periodically as publications issue
          market updates.
        </p>
      </div>
    );
  }

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
  const visibleItems = items.slice(startIndex, endIndex);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      {/* Top Pagination Summary */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <span>
          Showing{" "}
          <span className="font-semibold text-white">
            {startIndex + 1}–{endIndex}
          </span>{" "}
          of <span className="font-semibold text-white">{totalItems}</span>{" "}
          headlines
        </span>
        <span className="font-mono">
          Page {safePage} of {totalPages}
        </span>
      </div>

      {/* Paginated Headlines List (10 per page) */}
      <div className="space-y-3">
        {visibleItems.map(item => {
          const sourceLabel =
            item.sources && item.sources.length > 0
              ? item.sources.join(" · ")
              : item.source;

          return (
            <article
              key={item.id}
              className="animate-card-enter group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.05]"
            >
              {/* Header Row: Source Badge & Relative Time */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 font-medium",
                    getSourceBadgeClass(sourceLabel)
                  )}
                  title={item.sources ? item.sources.join(", ") : undefined}
                >
                  {sourceLabel}
                </span>
                <time
                  dateTime={item.publishedAt}
                  className="font-mono text-zinc-400"
                >
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
                    onError={e => {
                      e.currentTarget.style.display = "none";
                    }}
                    className="h-16 w-24 rounded-lg border border-white/10 object-cover bg-white/5 shrink-0"
                  />
                )}
              </div>

              {/* Matched Symbols Chips */}
              {item.matchedSymbols.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
                  <span className="text-[11px] text-zinc-400 font-mono">
                    Related:
                  </span>
                  {item.matchedSymbols.map(symbol => (
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
          );
        })}
      </div>

      {/* Bottom Pagination Controls Bar */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => handlePageChange(safePage - 1)}
            disabled={safePage <= 1}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              safePage <= 1
                ? "border-white/5 bg-white/[0.02] text-zinc-600 cursor-not-allowed"
                : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous 10
          </button>

          {/* Numbered Page Buttons */}
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNumber = idx + 1;
              const isCurrent = pageNumber === safePage;

              return (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => handlePageChange(pageNumber)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-mono transition-all cursor-pointer",
                    isCurrent
                      ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm shadow-emerald-500/20"
                      : "border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {pageNumber}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => handlePageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              safePage >= totalPages
                ? "border-white/5 bg-white/[0.02] text-zinc-600 cursor-not-allowed"
                : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
            )}
          >
            Next 10
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
