import { formatPrice, getInstrument } from "@contracts/instruments";
import type { Signal } from "@db/schema";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Clock, ExternalLink, Info } from "lucide-react";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function InstrumentLogo({ symbol }: { symbol: string }) {
  switch (symbol) {
    case "BTCUSDT":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#F7931A" />
          <path
            fill="#FFF"
            d="M22.184 14.037c.365-2.443-1.496-3.757-4.042-4.633l.826-3.311-2.015-.502-.804 3.225c-.53-.132-1.074-.256-1.615-.38l.81-3.249-2.016-.502-.826 3.31c-.439-.1-.87-.198-1.29-.3l.002-.009-2.78-.694-.537 2.15s1.496.343 1.465.364c.816.204.964.743.939 1.17l-.94 3.771c.056.014.129.035.21.068l-.213-.053-1.318 5.283c-.1.247-.354.618-.925.477.02.03-1.465-.366-1.465-.366l-1.002 2.312 2.624.654c.488.122.966.248 1.44.37l-.836 3.355 2.014.502.826-3.312c.55.149 1.085.285 1.61.414l-.823 3.303 2.016.502.836-3.354c3.438.651 6.023.388 7.112-2.72.877-2.502-.043-3.945-1.85-4.885 1.315-.304 2.304-1.17 2.569-2.955zm-4.59 6.452c-.623 2.504-4.836 1.15-6.201.81l1.107-4.437c1.366.341 5.733 1.018 5.094 3.627zm.624-6.49c-.568 2.277-4.077 1.12-5.215.836l1.004-4.025c1.138.284 4.792.813 4.211 3.189z"
          />
        </svg>
      );
    case "ETHUSDT":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path fill="#FFF" fillOpacity=".6" d="M16 4v9.065l7.656 3.42z" />
          <path fill="#FFF" d="M16 4L8.344 16.485 16 13.065z" />
          <path fill="#FFF" fillOpacity=".6" d="M16 23.336v5.66L23.663 18.2z" />
          <path fill="#FFF" d="M16 28.996v-5.66L8.344 18.2z" />
          <path fill="#FFF" fillOpacity=".2" d="M16 21.916l7.656-4.431L16 13.067z" />
          <path fill="#FFF" fillOpacity=".6" d="M8.344 17.485L16 21.916V13.067z" />
        </svg>
      );

    case "XAUUSD":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#B45309" />
          <path fill="#FEF08A" d="M7 11h18l-3 10H10L7 11z" />
          <path fill="#FDE047" d="M10 11l2 10h8l2-10H10z" />
          <path fill="#CA8A04" d="M7 11l3 10H8L5 11h2z" />
          <path fill="#FFF" fillOpacity=".4" d="M11 13h10v1.5H11z" />
        </svg>
      );
    case "EURUSD":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#1E3A8A" />
          <path
            fill="#FACC15"
            d="M16 6l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6zm-5 2l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6zm10 0l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6zm-12 5l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6zm14 0l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6z"
          />
        </svg>
      );
    case "GBPUSD":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#012169" />
          <path stroke="#FFF" strokeWidth="2.5" d="M0 0l32 32M32 0L0 32M16 0v32M0 16h32" />
          <path stroke="#C8102E" strokeWidth="1.5" d="M16 0v32M0 16h32" />
        </svg>
      );
    default:
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-mono text-[9px] font-bold text-emerald-400">
          {symbol.slice(0, 2)}
        </div>
      );
  }
}

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

export default function SignalCard({ signal: rawSignal }: { signal: Signal | Record<string, unknown> }) {
  const raw = rawSignal as Record<string, unknown>;
  const signal: Signal = {
    ...(raw as unknown as Signal),
    entry: Number(raw.entry ?? 0),
    stopLoss: Number(raw.stopLoss ?? raw.stop_loss ?? 0),
    tp1: Number(raw.tp1 ?? 0),
    tp2: Number(raw.tp2 ?? 0),
    tp3: Number(raw.tp3 ?? 0),
    entryFilled: Boolean(raw.entryFilled ?? raw.entry_filled ?? false),
    confidence: Number(raw.confidence ?? 0),
    rMultiple: (raw.rMultiple ?? raw.r_multiple ?? null) as number | null,
    exitPrice: (raw.exitPrice ?? raw.exit_price ?? null) as number | null,
    openedAt: (raw.openedAt ?? raw.opened_at ?? new Date()) as Date,
    expiresAt: (raw.expiresAt ?? raw.expires_at ?? new Date()) as Date,
    closedAt: (raw.closedAt ?? raw.closed_at ?? null) as Date | null,
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

  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${signal.symbol} ${inst?.name ?? ""} trading analysis news`,
  )}`;

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

        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <div className="flex items-center gap-2">
            <a
              href={googleSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Research ${signal.symbol} on Google`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-zinc-300 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 shadow-2xs"
            >
              <GoogleIcon className="h-3 w-3" />
              <span>Research</span>
              <ExternalLink className="h-2.5 w-2.5 opacity-60" />
            </a>
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
