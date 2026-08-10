/**
 * Binance market-data adapter.
 * Crypto uses USD-M Futures; proxy instruments use Spot. Both are public
 * market-data APIs and require no API key.
 */

import type { MarketDataSource } from "@contracts/instruments";

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

const SPOT_HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
];
const FUTURES_HOSTS = ["https://fapi.binance.com"];

async function fetchJson<T>(
  source: MarketDataSource,
  path: string
): Promise<T> {
  let lastErr: unknown;
  const hosts = source === "futures" ? FUTURES_HOSTS : SPOT_HOSTS;
  for (const host of hosts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${host}${path}`, { signal: controller.signal });
      if (!res.ok)
        throw new Error(`Binance HTTP ${res.status} for ${host}${path}`);
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
 * Fetch ascending klines from the selected Binance product.
 * `limit` max 1000. The last candle may still be forming — callers that
 * need closed candles only should drop it (see fetchClosedKlines).
 */
export async function fetchKlines(
  pair: string,
  interval: "15m" | "1h" | "4h",
  limit = 300,
  source: MarketDataSource = "spot"
): Promise<Candle[]> {
  const raw = await fetchJson<unknown[][]>(
    source,
    `${source === "futures" ? "/fapi/v1/klines" : "/api/v3/klines"}?symbol=${pair}&interval=${interval}&limit=${limit}`
  );
  const candles = raw.map(k => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
  const invalid = candles.find(
    candle =>
      ![
        candle.openTime,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      ].every(Number.isFinite) ||
      candle.openTime < 0 ||
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0 ||
      candle.low > candle.high ||
      candle.open < candle.low ||
      candle.open > candle.high ||
      candle.close < candle.low ||
      candle.close > candle.high ||
      candle.volume < 0
  );
  if (invalid) throw new Error("Binance returned an invalid kline payload");
  return candles;
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
  source: MarketDataSource = "spot"
): Promise<Candle[]> {
  const cacheKey = `${source}:${pair}:${interval}:${limit}`;
  const cached = klineCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < KLINE_CACHE_TTL_MS) {
    return cached.candles;
  }

  const candles = await fetchKlines(pair, interval, limit, source);
  const tfMs = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 }[interval];
  const now = Date.now();
  const closed = candles.filter(c => c.openTime + tfMs <= now);

  klineCache.set(cacheKey, { candles: closed, fetchedAt: Date.now() });
  return closed;
}

/** Klines including the still-forming active candle for real-time verification */
export async function fetchActiveKlines(
  pair: string,
  interval: "15m" | "1h" | "4h",
  limit = 300,
  source: MarketDataSource = "spot"
): Promise<Candle[]> {
  const cacheKey = `active:${source}:${pair}:${interval}:${limit}`;
  const cached = klineCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 5_000) {
    return cached.candles;
  }

  const candles = await fetchKlines(pair, interval, limit, source);
  klineCache.set(cacheKey, { candles, fetchedAt: Date.now() });
  return candles;
}

export async function fetchTicker24h(
  pair: string,
  source: MarketDataSource = "spot"
): Promise<Ticker24h> {
  const raw = await fetchJson<Record<string, string>>(
    source,
    `${source === "futures" ? "/fapi/v1/ticker/24hr" : "/api/v3/ticker/24hr"}?symbol=${pair}`
  );
  const ticker = {
    pair,
    lastPrice: Number(raw.lastPrice),
    priceChangePct: Number(raw.priceChangePercent),
    volume: Number(raw.volume),
    quoteVolume: Number(raw.quoteVolume),
  };
  if (
    !Object.values(ticker).every(
      value => typeof value === "string" || Number.isFinite(value)
    )
  ) {
    throw new Error("Binance returned an invalid ticker payload");
  }
  return ticker;
}

export async function fetchAllTickers(
  requests: Array<{ pair: string; source: MarketDataSource }>
): Promise<Ticker24h[]> {
  const results = await Promise.allSettled(
    requests.map(({ pair, source }) => fetchTicker24h(pair, source))
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<Ticker24h> => r.status === "fulfilled"
    )
    .map(r => r.value);
}
