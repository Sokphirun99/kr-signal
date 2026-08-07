import { useState } from "react";
import { useNews } from "@/lib/data/useNews";
import { formatRelativeTime } from "@/components/news/NewsList";
import { ChevronDown, ChevronUp, ExternalLink, Newspaper } from "lucide-react";

export interface SignalNewsProps {
  symbol: string;
}

/**
 * Collapsible section displaying third-party news context relevant to a specific signal symbol.
 * Inputs: instrument symbol string.
 * Outputs: collapsible news disclosure widget or null if no news exists.
 * Side effects: queries server news hook.
 * Failure modes: returns null on error or zero matching headlines.
 */
export function SignalNews({ symbol }: SignalNewsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { news, isLoading, isError } = useNews({ symbol, limit: 3 });

  if (isError || isLoading || !news || news.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-white/5 pt-2 text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-zinc-400 hover:text-emerald-400 font-medium transition-colors cursor-pointer py-1"
        aria-expanded={isOpen}
      >
        <Newspaper className="h-3.5 w-3.5 opacity-70" />
        <span>Related news · {news.length}</span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 pl-2 border-l border-white/10">
          {news.map((item) => (
            <div key={item.id} className="space-y-0.5">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start justify-between gap-2 text-zinc-300 hover:text-emerald-400 transition-colors"
              >
                <span className="font-medium line-clamp-1">{item.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100 mt-0.5" />
              </a>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span>{item.source}</span>
                <span>·</span>
                <span>{formatRelativeTime(item.publishedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
