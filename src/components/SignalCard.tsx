import { formatPrice, getInstrument } from "@contracts/instruments";
import type { Signal } from "@db/schema";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Clock, Info } from "lucide-react";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  open: { label: "Live", cls: "bg-sky-500/15 text-sky-400 border border-sky-500/20" },
  tp1: { label: "TP1 hit", cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" },
  tp2: { label: "TP2 hit", cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" },
  tp3: { label: "Full target", cls: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" },
  sl: { label: "Stopped", cls: "bg-red-500/15 text-red-400 border border-red-500/20" },
  be: { label: "Break-even", cls: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20" },
  expired: { label: "Expired", cls: "bg-amber-500/15 text-amber-400 border border-amber-500/20" },
  undecidable: { label: "Undecidable", cls: "bg-purple-500/15 text-purple-400 border border-purple-500/20" },
};

function formatUtcTime(dateInput: Date | string): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  return (
    d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

function Level({ label, value, decimals }: { label: string; value: number; decimals: number }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-zinc-100 mt-0.5">
        {formatPrice(value, decimals)}
      </p>
    </div>
  );
}

function getTimeLeft(expiresAt: Date | string): { text: string; urgencyCls: string } {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { text: "expired", urgencyCls: "text-zinc-400" };

  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  const m = Math.floor((ms % 3_600_000) / 60_000);

  const text = d > 0 ? `${d}d ${h % 24}h left` : `${h}h ${m}m left`;

  if (ms < 30 * 60_000) {
    return { text, urgencyCls: "text-red-400 font-semibold animate-pulse" };
  }
  if (ms < 2 * 3_600_000) {
    return { text, urgencyCls: "text-amber-400 font-medium" };
  }
  return { text, urgencyCls: "text-zinc-400" };
}

export default function SignalCard({ signal: raw }: { signal: Signal | any }) {
  const signal = {
    ...raw,
    entry: Number(raw.entry ?? 0),
    stopLoss: Number(raw.stopLoss ?? raw.stop_loss ?? 0),
    tp1: Number(raw.tp1 ?? 0),
    tp2: Number(raw.tp2 ?? 0),
    tp3: Number(raw.tp3 ?? 0),
    entryFilled: Boolean(raw.entryFilled ?? raw.entry_filled ?? false),
    confidence: Number(raw.confidence ?? 0),
    rMultiple: raw.rMultiple ?? raw.r_multiple ?? null,
    exitPrice: raw.exitPrice ?? raw.exit_price ?? null,
    openedAt: raw.openedAt ?? raw.opened_at ?? new Date(),
    expiresAt: raw.expiresAt ?? raw.expires_at ?? new Date(),
    closedAt: raw.closedAt ?? raw.closed_at ?? null,
  };

  const inst = getInstrument(signal.symbol);
  const decimals = inst?.decimals ?? 2;
  const st = STATUS_STYLE[signal.status] ?? {
    label: signal.status,
    cls: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20",
  };
  const isBuy = signal.side === "buy";
  const stopDiff = Math.abs(signal.entry - signal.stopLoss);

  // Hide TP3 when it equals TP2 (range capping)
  const isCapped = signal.tp3 > 0 && Math.abs(signal.tp3 - signal.tp2) < 1e-6;
  const maxTp = isCapped ? signal.tp2 : signal.tp3;
  const rr = stopDiff > 0 ? Math.abs(maxTp - signal.entry) / stopDiff : 0;
  const rMult = typeof signal.rMultiple === "number" ? Number(signal.rMultiple) : null;

  // Confidence pill color
  const confCls =
    signal.confidence >= 75
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
      : signal.confidence >= 60
      ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
      : "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";

  const { text: urgencyText, urgencyCls } = getTimeLeft(signal.expiresAt);

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-white/20 border-l-4 shadow-xs",
        isBuy ? "border-l-emerald-500" : "border-l-red-500",
      )}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border",
              isBuy
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/15 text-red-400 border-red-500/20",
            )}
          >
            {isBuy ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
          </span>
          <div>
            <div className="flex items-center gap-2">
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

        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <div className="flex items-center gap-2">
            {signal.status !== "open" && rMult !== null ? (
              <span
                className={cn(
                  "rounded-lg px-2.5 py-0.5 font-mono text-xs font-bold shadow-xs border tabular-nums",
                  rMult > 0
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    : rMult < 0
                    ? "bg-red-500/20 text-red-300 border-red-500/30"
                    : "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
                )}
              >
                {rMult > 0 ? "+" : ""}
                {rMult.toFixed(2)}R
              </span>
            ) : null}
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium border", st.cls)}>
              {st.label}
            </span>
          </div>
          <span
            title="Rule-engine confidence score (floor 60%)"
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium shadow-2xs tabular-nums cursor-help",
              confCls,
            )}
          >
            conf {signal.confidence}%
            <Info className="h-3 w-3 opacity-70" />
          </span>
        </div>
      </div>

      {/* Levels Grid */}
      <div
        className={cn(
          "mt-4 grid gap-4 rounded-lg bg-black/20 p-3 border border-white/5",
          isCapped ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-3 sm:grid-cols-6",
        )}
      >
        <Level label="Entry" value={signal.entry} decimals={decimals} />
        <Level label="Stop" value={signal.stopLoss} decimals={decimals} />
        <Level label="TP1" value={signal.tp1} decimals={decimals} />
        <Level
          label={isCapped ? "TP2 · final" : "TP2"}
          value={signal.tp2}
          decimals={decimals}
        />
        {!isCapped && <Level label="TP3" value={signal.tp3} decimals={decimals} />}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            {isCapped ? "Max R:R" : "R:R"}
          </p>
          <p className="font-mono text-sm font-semibold tabular-nums text-zinc-100 mt-0.5">
            1 : {rr.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Footer Meta Row */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-zinc-400">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Opened {formatUtcTime(signal.openedAt)}
            {signal.closedAt && ` · Closed ${formatUtcTime(signal.closedAt)}`}
          </span>

          {signal.status === "open" &&
            (signal.entryFilled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                In position · filled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-400/90">
                ⏳ Waiting for entry
              </span>
            ))}
        </div>

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
  );
}
