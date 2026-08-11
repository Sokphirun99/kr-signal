import { getEffectiveSignalExpiry, parseUtcDate } from "@contracts/instruments";
import type { ClientSignal } from "@contracts/instruments";

export const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  open: {
    label: "Live",
    cls: "bg-sky-500/15 text-sky-400 border border-sky-500/20",
  },
  tp1: {
    label: "TP1 hit",
    cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  },
  tp2: {
    label: "TP2 hit",
    cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  },
  tp3: {
    label: "Full target",
    cls: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  },
  sl: {
    label: "Stopped",
    cls: "bg-red-500/15 text-red-400 border border-red-500/20",
  },
  be: {
    label: "Break-even",
    cls: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20",
  },
  expired: {
    label: "Expired",
    cls: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  },
  undecidable: {
    label: "Undecidable",
    cls: "bg-purple-500/15 text-purple-400 border border-purple-500/20",
  },
};

/**
 * Formats a Date or UTC ISO string into human-readable local and UTC times.
 * Inputs: dateInput - Date object or ISO date string.
 * Outputs: formatted string "DD MMM YYYY, HH:MM (HH:MM UTC)".
 * Side effects: none.
 * Failure modes: returns empty string if dateInput is invalid.
 */
export function formatDisplayTime(dateInput: Date | string): string {
  const d = parseUtcDate(dateInput);
  if (isNaN(d.getTime())) return "";
  const dateStr = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const localTime = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const utcTime = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${dateStr}, ${localTime} (${utcTime} UTC)`;
}

/**
 * Calculates remaining validity duration until signal expiry.
 * Inputs: expiresAt - Date object or ISO timestamp string.
 * Outputs: object with text description and urgency CSS class names.
 * Side effects: reads current timestamp (Date.now()).
 * Failure modes: returns "expired" if timestamp has passed.
 */
export function getTimeLeft(expiresAt: Date | string): {
  text: string;
  urgencyCls: string;
} {
  const ms = parseUtcDate(expiresAt).getTime() - Date.now();
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

/**
 * Formats a nullable numeric indicator value with precision or fallback dash.
 * Inputs: value - nullable number, digits - decimal places (default 2).
 * Outputs: formatted string.
 * Side effects: none.
 * Failure modes: returns "—" on null/undefined.
 */
export function optionalNumber(
  value: number | null | undefined,
  digits = 2
): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(digits);
}

/**
 * Normalizes raw input from either tRPC camelCase or Supabase snake_case into canonical ClientSignal.
 * Inputs: raw - client signal or generic record.
 * Outputs: canonical ClientSignal object.
 * Side effects: none.
 * Failure modes: falls back to safe defaults on missing fields.
 */
export function normalizeSignal(
  rawSignal: ClientSignal | Record<string, unknown>
): ClientSignal {
  const raw = rawSignal as Record<string, unknown>;
  const openedAt = parseUtcDate(raw.openedAt ?? raw.opened_at);
  const storedExpiresAt = parseUtcDate(raw.expiresAt ?? raw.expires_at);
  const market = String(raw.market ?? "crypto") as ClientSignal["market"];
  const timeframe = String(raw.timeframe ?? "15m") as ClientSignal["timeframe"];
  const expiresAt = getEffectiveSignalExpiry(
    market as "crypto" | "gold" | "forex",
    timeframe as "15m" | "1h" | "4h",
    openedAt,
    storedExpiresAt
  );

  return {
    ...(raw as unknown as ClientSignal),
    market,
    timeframe,
    entry: Number(raw.entry ?? 0),
    stopLoss: Number(raw.stopLoss ?? raw.stop_loss ?? 0),
    tp1: Number(raw.tp1 ?? 0),
    tp2: Number(raw.tp2 ?? 0),
    tp3: Number(raw.tp3 ?? 0),
    entryFilled: Boolean(raw.entryFilled ?? raw.entry_filled ?? false),
    confidence: Number(raw.confidence ?? 0),
    strategyContext: (raw.strategyContext ??
      raw.strategy_context ??
      null) as Record<string, unknown> | null,
    rMultiple: (raw.rMultiple ?? raw.r_multiple ?? null) as number | null,
    exitPrice: (raw.exitPrice ?? raw.exit_price ?? null) as number | null,
    openedAt,
    expiresAt,
    closedAt:
      raw.closedAt || raw.closed_at
        ? parseUtcDate(raw.closedAt ?? raw.closed_at)
        : null,
  };
}
