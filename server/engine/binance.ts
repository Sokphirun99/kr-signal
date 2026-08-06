/**
 * Binance market-data adapter.
 * Uses the public market-data host (no API key required).
 */

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

const BASE_HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
];

async function fetchJson<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (const host of BASE_HOSTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${host}${path}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Binance HTTP ${res.status} for ${host}${path}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${path} from all Binance hosts`);
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

interface KlineCacheEntry {
  candles: Candle[];
  fetchedAt: number;
}

const klineCache = new Map<string, KlineCacheEntry>();
const KLINE_CACHE_TTL_MS = 30_000; // 30 seconds

/** Klines with the still-forming final candle removed */
export async function fetchClosedKlines(
  pair: string,
  interval: "15m" | "1h" | "4h",
  limit = 300,
): Promise<Candle[]> {
  const cacheKey = `${pair}:${interval}:${limit}`;
  const cached = klineCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < KLINE_CACHE_TTL_MS) {
    return cached.candles;
  }

  const candles = await fetchKlines(pair, interval, limit);
  const tfMs = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 }[interval];
  const now = Date.now();
  const closed = candles.filter((c) => c.openTime + tfMs <= now);

  klineCache.set(cacheKey, { candles: closed, fetchedAt: Date.now() });
  return closed;
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
  try {
    const encodedSymbols = encodeURIComponent(JSON.stringify(pairs));
    const raw = await fetchJson<Record<string, string>[]>(
      `/api/v3/ticker/24hr?symbols=${encodedSymbols}`,
    );
    if (Array.isArray(raw)) {
      return raw.map((t) => ({
        pair: String(t.symbol),
        lastPrice: Number(t.lastPrice),
        priceChangePct: Number(t.priceChangePercent),
        volume: Number(t.volume),
        quoteVolume: Number(t.quoteVolume),
      }));
    }
  } catch {
    // Fall back to individual ticker fetches
  }

  const results = await Promise.allSettled(pairs.map((p) => fetchTicker24h(p)));
  return results
    .filter((r): r is PromiseFulfilledResult<Ticker24h> => r.status === "fulfilled")
    .map((r) => r.value);
}

