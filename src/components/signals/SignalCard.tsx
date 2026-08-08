import { useState } from "react";
import { getInstrument } from "@contracts/instruments";
import type { ClientSignal } from "@contracts/instruments";
import { cn } from "@/lib/utils";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Share2,
  Check,
  Send,
  Sliders,
  FileCode,
} from "lucide-react";
import { InstrumentLogo } from "./InstrumentLogo";
import { SignalStatusBadge } from "./SignalStatusBadge";
import { SignalLevels } from "./SignalLevels";
import { formatDisplayTime, getTimeLeft, normalizeSignal } from "./signalFormat";
import { SignalNews } from "./SignalNews";
import { copySetupToClipboard, type ExportFormat } from "@/utils/exportSetup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SignalCardProps {
  signal: ClientSignal | Record<string, unknown>;
}

/**
 * Verified signal card layout composing header, status, integrated level geometry, and status footer.
 * Inputs: props with raw or normalized ClientSignal.
 * Outputs: React JSX signal card.
 * Side effects: none.
 * Failure modes: normalizes input safely with fallbacks.
 */
export function SignalCard({ signal: rawSignal }: SignalCardProps) {
  const [copiedFormat, setCopiedFormat] = useState<ExportFormat | null>(null);

  const signal = normalizeSignal(rawSignal);
  const inst = getInstrument(signal.symbol);
  const decimals = inst?.decimals ?? 2;
  const isBuy = signal.side === "buy";
  const rMult = typeof signal.rMultiple === "number" ? Number(signal.rMultiple) : null;
  const { text: urgencyText, urgencyCls } = getTimeLeft(signal.expiresAt);

  const handleCopy = async (format: ExportFormat) => {
    setCopiedFormat(format);
    await copySetupToClipboard(signal, format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  return (
    <div
      className={cn(
        "animate-card-enter rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-all duration-200 hover:border-white/25 hover:bg-white/[0.045] hover:shadow-lg border-l-4",
        isBuy ? "border-l-emerald-500 hover:shadow-emerald-950/20" : "border-l-red-500 hover:shadow-red-950/20",
      )}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border shadow-xs transition-transform duration-200 hover:scale-105",
              isBuy
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/15 text-red-400 border-red-500/20",
            )}
          >
            {isBuy ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <InstrumentLogo symbol={signal.symbol} />
              <span className="font-semibold text-base text-white">{signal.symbol}</span>
              <span className="text-xs text-zinc-400">
                {inst?.name} · {signal.timeframe}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
              <span className={cn("font-bold tracking-wide", isBuy ? "text-emerald-400" : "text-red-400")}>
                {signal.side?.toUpperCase()}
              </span>
              <span>·</span>
              <span className="capitalize">{signal.style} setup</span>
              <span>·</span>
              <span>{signal.engine === "rules" ? "Rule engine" : "AI council"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SignalStatusBadge signal={signal} pair={inst?.pair} />

          {/* Quick Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                title="Export Setup (Telegram, MT5, JSON)"
                aria-label="Export trade setup"
              >
                {copiedFormat ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-white/10 bg-[#0a0e0b] text-zinc-200 shadow-xl">
              <DropdownMenuItem
                onClick={() => handleCopy("telegram")}
                className="flex cursor-pointer items-center gap-2 text-xs hover:bg-white/10"
              >
                <Send className="h-3.5 w-3.5 text-emerald-400" />
                Copy for Telegram / Discord
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCopy("mt5")}
                className="flex cursor-pointer items-center gap-2 text-xs hover:bg-white/10"
              >
                <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                Copy MT5 Order Ticket
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCopy("json")}
                className="flex cursor-pointer items-center gap-2 text-xs hover:bg-white/10"
              >
                <FileCode className="h-3.5 w-3.5 text-amber-400" />
                Copy Raw JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Levels Grid & Visual Risk:Reward Geometry Progression */}
      <SignalLevels signal={signal} decimals={decimals} />

      {/* Footer Meta Row */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-zinc-400">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Opened {formatDisplayTime(signal.openedAt)}
            {signal.closedAt && ` · Closed ${formatDisplayTime(signal.closedAt)}`}
          </span>

          {signal.status === "open" &&
            (signal.entryFilled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/20">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                In position · filled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-400/90">
                ⏳ Waiting for entry
              </span>
            ))}
        </div>

        <div className="flex items-center gap-3">
          {signal.status === "open" ? (
            <span className={cn("flex items-center gap-1 font-mono text-xs tabular-nums", urgencyCls)}>
              <Clock className="h-3 w-3" />
              {urgencyText}
            </span>
          ) : rMult !== null ? (
            <span className="font-mono text-xs tabular-nums text-zinc-400">
              Result:{" "}
              <span
                className={
                  rMult > 0
                    ? "text-emerald-400 font-semibold"
                    : rMult < 0
                    ? "text-red-400 font-semibold"
                    : "text-zinc-300"
                }
              >
                {rMult > 0 ? "+" : ""}
                {rMult.toFixed(2)}R
              </span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Related News Context */}
      <SignalNews symbol={signal.symbol} />
    </div>
  );
}

export default SignalCard;
