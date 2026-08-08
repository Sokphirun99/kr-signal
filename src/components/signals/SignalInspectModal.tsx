import { useState } from "react";
import type { ClientSignal } from "@contracts/instruments";
import { formatPrice, getInstrument } from "@contracts/instruments";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InstrumentLogo } from "./InstrumentLogo";
import { SignalStatusBadge } from "./SignalStatusBadge";
import { copySetupToClipboard, type ExportFormat } from "@/utils/exportSetup";
import { cn } from "@/lib/utils";
import {
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import { formatDisplayTime, getTimeLeft } from "./signalFormat";

export interface SignalInspectModalProps {
  signal: ClientSignal | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Interactive inspection modal rendering Risk:Reward price geometry, level deltas, and setup export tools.
 * Inputs: signal - ClientSignal or null, isOpen - boolean, onOpenChange - handler.
 * Outputs: React JSX modal dialog.
 * Side effects: opens/closes dialog, triggers clipboard copies.
 * Failure modes: renders nothing when signal is null.
 */
export function SignalInspectModal({ signal, isOpen, onOpenChange }: SignalInspectModalProps) {
  const [copiedFormat, setCopiedFormat] = useState<ExportFormat | null>(null);

  if (!signal) return null;

  const inst = getInstrument(signal.symbol);
  const decimals = inst?.decimals ?? 2;
  const isBuy = signal.side === "buy";
  const { text: urgencyText } = getTimeLeft(signal.expiresAt);

  const riskAmount = Math.abs(signal.entry - signal.stopLoss);
  const riskPct = signal.entry > 0 ? (riskAmount / signal.entry) * 100 : 0;

  const tp1Delta = Math.abs(signal.tp1 - signal.entry);
  const tp1Pct = signal.entry > 0 ? (tp1Delta / signal.entry) * 100 : 0;

  const tp2Delta = Math.abs(signal.tp2 - signal.entry);
  const tp2Pct = signal.entry > 0 ? (tp2Delta / signal.entry) * 100 : 0;

  const tp3Delta = Math.abs(signal.tp3 - signal.entry);
  const tp3Pct = signal.entry > 0 ? (tp3Delta / signal.entry) * 100 : 0;

  const handleCopy = async (format: ExportFormat) => {
    setCopiedFormat(format);
    await copySetupToClipboard(signal, format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-white/10 bg-[#070a08]/95 p-6 text-zinc-200 backdrop-blur-xl sm:rounded-2xl">
        <DialogHeader className="border-b border-white/10 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <InstrumentLogo symbol={signal.symbol} className="h-8 w-8" />
              <div>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
                  <span>{signal.symbol}</span>
                  <span className="text-sm font-normal text-zinc-400">
                    ({inst?.name ?? signal.symbol})
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400">
                  {signal.timeframe} timeframe · {signal.style.toUpperCase()} setup ·{" "}
                  {signal.engine === "rules" ? "Rule Engine" : "AI Council"}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SignalStatusBadge signal={signal} pair={inst?.pair} />
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider",
                  isBuy
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-red-500/20 text-red-400 border border-red-500/30",
                )}
              >
                {signal.side?.toUpperCase()}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Visual Risk:Reward Geometry Canvas */}
        <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-emerald-400" />
              Risk : Reward Price Geometry
            </span>
            <span className="font-mono text-zinc-500">1 : 3.0 Max R</span>
          </div>

          <div className="relative mt-4 space-y-2 font-mono text-xs">
            {/* TP3 Level */}
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2">
              <div className="flex items-center gap-2 text-emerald-400">
                <Target className="h-4 w-4" />
                <span className="font-semibold">Target 3 (3.0R)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400/80">+{tp3Pct.toFixed(2)}%</span>
                <span className="font-bold text-white">{formatPrice(signal.tp3, decimals)}</span>
              </div>
            </div>

            {/* TP2 Level */}
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-3 py-2">
              <div className="flex items-center gap-2 text-emerald-400/90">
                <Target className="h-4 w-4" />
                <span className="font-semibold">Target 2 (2.2R)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400/80">+{tp2Pct.toFixed(2)}%</span>
                <span className="font-bold text-white">{formatPrice(signal.tp2, decimals)}</span>
              </div>
            </div>

            {/* TP1 Level */}
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-950/10 px-3 py-2">
              <div className="flex items-center gap-2 text-emerald-400/80">
                <Target className="h-4 w-4" />
                <span className="font-semibold">Target 1 (1.4R)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400/80">+{tp1Pct.toFixed(2)}%</span>
                <span className="font-bold text-white">{formatPrice(signal.tp1, decimals)}</span>
              </div>
            </div>

            {/* Entry Pivot Level */}
            <div className="flex items-center justify-between rounded-lg border border-cyan-500/40 bg-cyan-950/20 px-3 py-2.5 shadow-sm">
              <div className="flex items-center gap-2 text-cyan-300">
                <Sparkles className="h-4 w-4" />
                <span className="font-bold">Entry Price (Pivot)</span>
              </div>
              <span className="text-sm font-black text-white">{formatPrice(signal.entry, decimals)}</span>
            </div>

            {/* Stop Loss Level */}
            <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
              <div className="flex items-center gap-2 text-red-400">
                <Shield className="h-4 w-4" />
                <span className="font-semibold">Stop Loss (1.0R Risk)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-red-400/80">-{riskPct.toFixed(2)}%</span>
                <span className="font-bold text-white">{formatPrice(signal.stopLoss, decimals)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Metrics Table */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono text-xs">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <span className="text-zinc-500">Risk Delta (1R)</span>
            <p className="mt-1 font-bold text-zinc-100">{formatPrice(riskAmount, decimals)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <span className="text-zinc-500">Confidence</span>
            <p className="mt-1 font-bold text-emerald-400">{signal.confidence}%</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <span className="text-zinc-500">Opened At</span>
            <p className="mt-1 text-zinc-300">{formatDisplayTime(signal.openedAt)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <span className="text-zinc-500">Expires In</span>
            <p className="mt-1 text-amber-400">{urgencyText}</p>
          </div>
        </div>

        {/* Action Toolbar: One-Click Setup Exporters */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="text-xs text-zinc-400">
            Export setup to trading bot or order ticket:
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopy("telegram")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
            >
              {copiedFormat === "telegram" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              Telegram / Discord
            </button>

            <button
              type="button"
              onClick={() => handleCopy("mt5")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
            >
              {copiedFormat === "mt5" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              MT5 Ticket
            </button>

            <button
              type="button"
              onClick={() => handleCopy("json")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
            >
              {copiedFormat === "json" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              JSON
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
