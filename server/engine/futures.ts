/**
 * Binance USD-M Futures funding rate adapter.
 * Uses public endpoint https://fapi.binance.com (no API key required).
 * Throttled with 5-minute in-memory cache per symbol and 8s timeout.
 */

const FAPI_BASE = "https://fapi.binance.com";
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60_000;

interface CacheEntry {
  rate: number | null;
  fetchedAt: number;
}

const fundingCache = new Map<string, CacheEntry>();

export async function fetchFundingRate(symbol: string): Promise<number | null> {
  const cached = fundingCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rate;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${FAPI_BASE}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`Binance Futures HTTP ${res.status}`);
    const data = (await res.json()) as Array<{ fundingRate: string }>;
    if (!Array.isArray(data) || data.length === 0) throw new Error("Empty funding response");
    const rate = Number(data[0].fundingRate);
    if (Number.isNaN(rate)) throw new Error("Invalid funding rate value");

    fundingCache.set(symbol, { rate, fetchedAt: Date.now() });
    return rate;
  } catch (err) {
    // Failure fallback: cache null, neutral score, never block pipeline
    fundingCache.set(symbol, { rate: null, fetchedAt: Date.now() });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface OiCacheEntry {
  openInterest: number | null;
  fetchedAt: number;
}

const oiCache = new Map<string, OiCacheEntry>();

export async function fetchOpenInterest(symbol: string): Promise<number | null> {
  const cached = oiCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.openInterest;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${FAPI_BASE}/fapi/v1/openInterest?symbol=${symbol}`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`Binance Futures OI HTTP ${res.status}`);
    const data = (await res.json()) as { openInterest: string };
    const openInterest = Number(data.openInterest);
    if (Number.isNaN(openInterest)) throw new Error("Invalid OI value");

    oiCache.set(symbol, { openInterest, fetchedAt: Date.now() });
    return openInterest;
  } catch {
    oiCache.set(symbol, { openInterest: null, fetchedAt: Date.now() });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

