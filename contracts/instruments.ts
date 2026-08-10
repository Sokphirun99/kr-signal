/**
 * KR-Signal — instrument registry shared between frontend and backend.
 *
 * Data source note: crypto instruments use Binance USD-M Futures so their
 * candles/tickers match the futures funding, OI, and taker inputs. Gold and
 * forex instruments remain Binance Spot proxies:
 *   - Gold  → PAXG/USDT  (PAX Gold token, ~1:1 with one troy oz of gold)
 *   - EURUSD → EUR/USDT  (USDT ≈ USD, small stablecoin basis)
 *   - GBPUSD → GBP/USDT
 * The `basisNote` is shown in the UI wherever the instrument appears.
 */

export type Market = "crypto" | "gold" | "forex";
export type Timeframe = "15m" | "1h" | "4h";
export type TradeSide = "buy" | "sell";
export type StrategyStyle = "trend" | "range";
export type MarketDataSource = "futures" | "spot";

export type SignalStatus =
  "open" | "tp1" | "tp2" | "tp3" | "sl" | "be" | "expired" | "undecidable";

/**
 * Ledger status semantics are terminal, not progressive:
 * - `open` means the trade is still being evaluated.
 * - `tp2` means a chandelier stop closed the trade after TP2 was reached.
 * - `tp3`, `sl`, and `be` describe the realized exit.
 * - `expired` and `undecidable` are ungraded terminal outcomes.
 *
 * `tp1` remains in the persisted enum for backward compatibility, but the
 * current no-partial-exit execution model does not emit it. Target touches
 * before the terminal exit are reconstructed from candle history.
 */

export type EngineLabel = "rules" | "ai";

export interface Instrument {
  /** Canonical symbol shown in the UI, e.g. "BTCUSDT" */
  symbol: string;
  /** Display name, e.g. "Bitcoin" */
  name: string;
  market: Market;
  /** Binance symbol used for klines/ticker */
  pair: string;
  /** Binance product whose OHLC/ticker tape is authoritative for this instrument */
  dataSource: MarketDataSource;
  /** Price display decimals */
  decimals: number;
  /** Shown to users when the feed is a proxy */
  basisNote?: string;
}

export const INSTRUMENTS: Instrument[] = [
  {
    symbol: "BTCUSDT",
    name: "Bitcoin",
    market: "crypto",
    pair: "BTCUSDT",
    dataSource: "futures",
    decimals: 1,
  },
  {
    symbol: "ETHUSDT",
    name: "Ethereum",
    market: "crypto",
    pair: "ETHUSDT",
    dataSource: "futures",
    decimals: 2,
  },
  {
    symbol: "XAUUSD",
    name: "Gold",
    market: "gold",
    pair: "PAXGUSDT",
    dataSource: "spot",
    decimals: 2,
    basisNote: "PAXG/USDT proxy — tracks spot gold with a small token basis",
  },
  {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    market: "forex",
    pair: "EURUSDT",
    dataSource: "spot",
    decimals: 4,
    basisNote: "EUR/USDT proxy — tracks EUR/USD with a small stablecoin basis",
  },
  {
    symbol: "GBPUSD",
    name: "Pound / US Dollar",
    market: "forex",
    pair: "GBPUSDT",
    dataSource: "spot",
    decimals: 4,
    basisNote: "GBP/USDT proxy — tracks GBP/USD with a small stablecoin basis",
  },
];

export const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h"];

/** Milliseconds per candle for each timeframe */
export const TF_MS: Record<Timeframe, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

/** Default validity for slower proxy markets (gold and forex). */
export const EXPIRY_MS: Record<Timeframe, number> = {
  "15m": 8 * 60 * 60_000, // 8 hours
  "1h": 24 * 60 * 60_000, // 1 day
  "4h": 4 * 24 * 60 * 60_000, // 4 days
};

/** Shorter validity for crypto, where setups become stale more quickly. */
export const CRYPTO_EXPIRY_MS: Record<Timeframe, number> = {
  "15m": 4 * 60 * 60_000, // 4 hours
  "1h": 12 * 60 * 60_000, // 12 hours
  "4h": 2 * 24 * 60 * 60_000, // 48 hours
};

/** Returns the publication-time validity window for a market/timeframe pair. */
export function getSignalExpiryMs(
  market: Market,
  timeframe: Timeframe
): number {
  return market === "crypto"
    ? CRYPTO_EXPIRY_MS[timeframe]
    : EXPIRY_MS[timeframe];
}

/**
 * Caps a stored expiry at the current market policy. This lets existing open
 * signals adopt shorter windows without ever extending an older deadline.
 */
export function getEffectiveSignalExpiry(
  market: Market,
  timeframe: Timeframe,
  openedAt: Date,
  storedExpiresAt: Date
): Date {
  if (market !== "crypto") return storedExpiresAt;

  const storedDuration = storedExpiresAt.getTime() - openedAt.getTime();
  const legacyDuration = EXPIRY_MS[timeframe];
  const currentDuration = CRYPTO_EXPIRY_MS[timeframe];
  const migrationToleranceMs = 5 * 60_000;
  const usesLegacyWindow =
    storedDuration > currentDuration &&
    storedDuration <= legacyDuration + migrationToleranceMs;

  return usesLegacyWindow
    ? new Date(openedAt.getTime() + currentDuration)
    : storedExpiresAt;
}

/** Statuses that count as a market-graded (closed) outcome */
export const CLOSED_STATUSES: SignalStatus[] = [
  "tp1",
  "tp2",
  "tp3",
  "sl",
  "be",
];

/** Every terminal status, including outcomes excluded from performance grading. */
export const TERMINAL_STATUSES: SignalStatus[] = [
  ...CLOSED_STATUSES,
  "expired",
  "undecidable",
];

/** Statuses that count as wins for the win-rate formula */
export const WIN_STATUSES: SignalStatus[] = ["tp1", "tp2", "tp3"];

export function getInstrument(symbol: string): Instrument | undefined {
  return INSTRUMENTS.find(i => i.symbol === symbol);
}

export function formatPrice(price: number, decimals: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Safely parses any Date input or ISO string without an explicit offset
 * strictly as a UTC timestamp. Prevents browser local timezone shifting.
 */
export function parseUtcDate(input: unknown): Date {
  if (!input) return new Date();
  if (input instanceof Date) return input;
  if (typeof input === "string") {
    let str = input.trim();
    if (!str) return new Date();
    if (str.includes(" ") && !str.includes("T")) {
      str = str.replace(" ", "T");
    }
    if (!str.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(str)) {
      str += "Z";
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  const d = new Date(String(input));
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Minimal row shape accepted by the track-record pure function.
 * Each data source (server Drizzle, client Supabase) maps ITS own rows
 * into this canonical camelCase shape before calling computeTrackRecordFromSignals.
 * Inputs: N/A (type definition).
 * Outputs: N/A (type definition).
 * Side effects: none.
 * Failure modes: none.
 */
export interface ClosedSignalRow {
  status: SignalStatus;
  rMultiple: number;
  market: string;
  closedAt: Date | string | null;
}

/**
 * Client-side signal shape matching the Drizzle Signal type.
 * Defined in contracts/ so both server and client can reference it
 * without either depending on the Drizzle-generated db/ type.
 */
export interface ClientSignal {
  id: number;
  symbol: string;
  market: string;
  timeframe: string;
  style: string;
  side: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  confidence: number;
  strategyContext?: Record<string, unknown> | null;
  engineConfigVersion?: number;
  status: string;
  engine: string;
  entryFilled: boolean;
  rMultiple: number | null;
  exitPrice: number | null;
  setupAt: Date | string;
  openedAt: Date | string;
  expiresAt: Date | string;
  closedAt: Date | string | null;
}
