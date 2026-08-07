/**
 * KR-Signal — instrument registry shared between frontend and backend.
 *
 * Data source note: every instrument is resolved through Binance spot pairs
 * (data-api.binance.vision). Gold and forex instruments are proxies:
 *   - Gold  → PAXG/USDT  (PAX Gold token, ~1:1 with one troy oz of gold)
 *   - EURUSD → EUR/USDT  (USDT ≈ USD, small stablecoin basis)
 *   - GBPUSD → GBP/USDT
 * The `basisNote` is shown in the UI wherever the instrument appears.
 */

export type Market = "crypto" | "gold" | "forex";
export type Timeframe = "15m" | "1h" | "4h";
export type TradeSide = "buy" | "sell";
export type StrategyStyle = "trend" | "range";

export type SignalStatus =
  | "open"
  | "tp1"
  | "tp2"
  | "tp3"
  | "sl"
  | "be"
  | "expired"
  | "undecidable";

export type EngineLabel = "rules" | "ai";

export interface Instrument {
  /** Canonical symbol shown in the UI, e.g. "BTCUSDT" */
  symbol: string;
  /** Display name, e.g. "Bitcoin" */
  name: string;
  market: Market;
  /** Binance spot pair used for klines/ticker */
  pair: string;
  /** Price display decimals */
  decimals: number;
  /** Shown to users when the feed is a proxy */
  basisNote?: string;
}

export const INSTRUMENTS: Instrument[] = [
  { symbol: "BTCUSDT", name: "Bitcoin", market: "crypto", pair: "BTCUSDT", decimals: 1 },
  { symbol: "ETHUSDT", name: "Ethereum", market: "crypto", pair: "ETHUSDT", decimals: 2 },
  {
    symbol: "XAUUSD",
    name: "Gold",
    market: "gold",
    pair: "PAXGUSDT",
    decimals: 2,
    basisNote: "PAXG/USDT proxy — tracks spot gold with a small token basis",
  },
  {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    market: "forex",
    pair: "EURUSDT",
    decimals: 4,
    basisNote: "EUR/USDT proxy — tracks EUR/USD with a small stablecoin basis",
  },
  {
    symbol: "GBPUSD",
    name: "Pound / US Dollar",
    market: "forex",
    pair: "GBPUSDT",
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

/** How long a published setup stays valid before it expires ungraded */
export const EXPIRY_MS: Record<Timeframe, number> = {
  "15m": 8 * 60 * 60_000, // 8 hours
  "1h": 24 * 60 * 60_000, // 1 day
  "4h": 4 * 24 * 60 * 60_000, // 4 days
};

/** Statuses that count as a market-graded (closed) outcome */
export const CLOSED_STATUSES: SignalStatus[] = ["tp1", "tp2", "tp3", "sl", "be"];

/** Statuses that count as wins for the win-rate formula */
export const WIN_STATUSES: SignalStatus[] = ["tp1", "tp2", "tp3"];

export function getInstrument(symbol: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.symbol === symbol);
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
