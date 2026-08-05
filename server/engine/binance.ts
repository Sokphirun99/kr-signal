/**
 * Binance market-data adapter.
 * Uses the public market-data host (no API key required).
 */

const BASE = "https://data-api.binance.vision";
const TIMEOUT_MS = 10_000;

export interface Candle {
  /** Candle open time, ms epoch */
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker24h {
  pair: string;
  lastPrice: number;
  priceChangePct: number;
  volume: number;
  quoteVolume: number;
}

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Binance HTTP ${res.status} for ${path}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch klines for a spot pair. Returns ascending candles.
 * `limit` max 1000. The last candle may still be forming — callers that
 * need closed candles only should drop it (see fetchClosedKlines).
 */
export async function fetchKlines(
  pair: string,
  interval: "15m" | "1h" | "4h",
  limit = 300,
): Promise<Candle[]> {
  const raw = await fetchJson<unknown[][]>(
    `/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
  );
  return raw.map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

/** Klines with the still-forming final candle removed */
export async function fetchClosedKlines(
  pair: string,
  interval: "15m" | "1h" | "4h",
  limit = 300,
): Promise<Candle[]> {
  const candles = await fetchKlines(pair, interval, limit);
  const tfMs = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 }[interval];
  const now = Date.now();
  return candles.filter((c) => c.openTime + tfMs <= now);
}

export async function fetchTicker24h(pair: string): Promise<Ticker24h> {
  const raw = await fetchJson<Record<string, string>>(
    `/api/v3/ticker/24hr?symbol=${pair}`,
  );
  return {
    pair,
    lastPrice: Number(raw.lastPrice),
    priceChangePct: Number(raw.priceChangePercent),
    volume: Number(raw.volume),
    quoteVolume: Number(raw.quoteVolume),
  };
}

export async function fetchAllTickers(pairs: string[]): Promise<Ticker24h[]> {
  const results = await Promise.allSettled(pairs.map((p) => fetchTicker24h(p)));
  return results
    .filter((r): r is PromiseFulfilledResult<Ticker24h> => r.status === "fulfilled")
    .map((r) => r.value);
}
