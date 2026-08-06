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
  } catch {
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

interface TakerRatioCacheEntry {
  ratio: number | null;
  fetchedAt: number;
}

const takerCache = new Map<string, TakerRatioCacheEntry>();

export async function fetchTakerRatio(symbol: string): Promise<number | null> {
  const cached = takerCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.ratio;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${FAPI_BASE}/futures/data/takerlongshortRatio?symbol=${symbol}&period=5m&limit=1`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`Binance Taker Ratio HTTP ${res.status}`);
    const data = (await res.json()) as Array<{ buySellRatio: string }>;
    if (!Array.isArray(data) || data.length === 0) throw new Error("Empty taker ratio response");
    const ratio = Number(data[0].buySellRatio);
    if (Number.isNaN(ratio)) throw new Error("Invalid taker ratio");

    takerCache.set(symbol, { ratio, fetchedAt: Date.now() });
    return ratio;
  } catch {
    takerCache.set(symbol, { ratio: null, fetchedAt: Date.now() });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface SentimentCacheEntry {
  value: number | null;
  fetchedAt: number;
}

let sentimentCache: SentimentCacheEntry | null = null;

export async function fetchFearAndGreed(): Promise<number | null> {
  if (sentimentCache && Date.now() - sentimentCache.fetchedAt < CACHE_TTL_MS) {
    return sentimentCache.value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.alternative.me/fapi/?limit=1", {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Fear & Greed HTTP ${res.status}`);
    const body = (await res.json()) as { data?: Array<{ value: string }> };
    if (!body.data || body.data.length === 0) throw new Error("Empty sentiment response");
    const value = Number(body.data[0].value);
    if (Number.isNaN(value)) throw new Error("Invalid sentiment value");

    sentimentCache = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    sentimentCache = { value: null, fetchedAt: Date.now() };
    return null;
  } finally {
    clearTimeout(timer);
  }
}


