import { formatPrice, getInstrument } from "@contracts/instruments";
import type { Signal } from "@db/schema";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Clock } from "lucide-react";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  open: { label: "Live", cls: "bg-sky-500/15 text-sky-400" },
  tp1: { label: "TP1 hit", cls: "bg-emerald-500/15 text-emerald-400" },
  tp2: { label: "TP2 hit", cls: "bg-emerald-500/15 text-emerald-400" },
  tp3: { label: "Full target", cls: "bg-emerald-500/20 text-emerald-300" },
  sl: { label: "Stopped", cls: "bg-red-500/15 text-red-400" },
  be: { label: "Break-even", cls: "bg-zinc-500/15 text-zinc-400" },
  expired: { label: "Expired", cls: "bg-amber-500/15 text-amber-400" },
  undecidable: { label: "Undecidable", cls: "bg-purple-500/15 text-purple-400" },
};

function Level({ label, value, decimals }: { label: string; value: number; decimals: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="font-mono text-sm text-zinc-100">{formatPrice(value, decimals)}</p>
    </div>
  );
}

function timeLeft(expiresAt: Date | string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h left`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m left`;
}

export default function SignalCard({ signal: raw }: { signal: Signal | any }) {
  const signal = {
    ...raw,
    entry: Number(raw.entry ?? 0),
    stopLoss: Number(raw.stopLoss ?? raw.stop_loss ?? 0),
    tp1: Number(raw.tp1 ?? 0),
    tp2: Number(raw.tp2 ?? 0),
    tp3: Number(raw.tp3 ?? 0),
    rMultiple: raw.rMultiple ?? raw.r_multiple ?? null,
    exitPrice: raw.exitPrice ?? raw.exit_price ?? null,
    openedAt: raw.openedAt ?? raw.opened_at ?? new Date(),
    expiresAt: raw.expiresAt ?? raw.expires_at ?? new Date(),
    closedAt: raw.closedAt ?? raw.closed_at ?? null,
  };

  const inst = getInstrument(signal.symbol);
  const decimals = inst?.decimals ?? 2;
  const st = STATUS_STYLE[signal.status] ?? { label: signal.status, cls: "bg-zinc-500/15 text-zinc-400" };
  const isBuy = signal.side === "buy";
  const stopDiff = Math.abs(signal.entry - signal.stopLoss);
  const rr = stopDiff > 0 ? Math.abs(signal.tp1 - signal.entry) / stopDiff : 0;
  const rMult = typeof signal.rMultiple === "number" ? signal.rMultiple : null;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5 transition-colors hover:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              isBuy ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
            )}
          >
            {isBuy ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{signal.symbol}</span>
              <span className="text-xs text-zinc-500">
                {inst?.name} · {signal.timeframe}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
              <span className={cn("font-medium", isBuy ? "text-emerald-400" : "text-red-400")}>
                {signal.side?.toUpperCase()}
              </span>
              <span>·</span>
              <span className="capitalize">{signal.style} setup</span>
              <span>·</span>
              <span>{signal.engine === "rules" ? "Rule engine" : "AI council"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st.cls)}>
            {st.label}
          </span>
          <span className="font-mono text-xs text-zinc-500">
            conf {signal.confidence}%
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
        <Level label="Entry" value={signal.entry} decimals={decimals} />
        <Level label="Stop" value={signal.stopLoss} decimals={decimals} />
        <Level label="TP1" value={signal.tp1} decimals={decimals} />
        <Level label="TP2" value={signal.tp2} decimals={decimals} />
        <Level label="TP3" value={signal.tp3} decimals={decimals} />
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">R:R</p>
          <p className="font-mono text-sm text-zinc-100">1 : {rr.toFixed(1)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-zinc-500">
        <span>
          Opened {new Date(signal.openedAt).toUTCString().slice(5, 22)} UTC
          {signal.closedAt &&
            ` · Closed ${new Date(signal.closedAt).toUTCString().slice(5, 22)} UTC`}
        </span>
        {signal.status === "open" ? (
          <span className="flex items-center gap-1 font-mono">
            <Clock className="h-3 w-3" />
            {timeLeft(signal.expiresAt)}
          </span>
        ) : rMult !== null ? (
          <span
            className={cn(
              "font-mono font-medium",
              rMult > 0
                ? "text-emerald-400"
                : rMult < 0
                  ? "text-red-400"
                  : "text-zinc-400",
            )}
          >
            {rMult > 0 ? "+" : ""}
            {rMult.toFixed(2)}R
          </span>
        ) : null}
      </div>
    </div>
  );
}
