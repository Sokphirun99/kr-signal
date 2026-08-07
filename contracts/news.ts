/**
 * KR-Signal — news contracts shared between frontend and backend.
 * Display-only context; never used in signal generation, gating, or verification.
 */

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  /** ISO UTC timestamp, e.g. "2026-08-08T01:30:00.000Z" */
  publishedAt: string;
  summary: string | null;
  imageUrl?: string | null;
  matchedSymbols: string[];
}

export const NEWS_KEYWORDS: Record<string, string[]> = {
  BTCUSDT: ["bitcoin", "btc"],
  ETHUSDT: ["ethereum", "ether", "eth"],
  XAUUSD: ["gold", "xauusd", "bullion"],
  EURUSD: ["eur/usd", "euro dollar", "ecb", "european central bank"],
  GBPUSD: ["gbp/usd", "pound sterling", "boe", "bank of england"],
};

/**
 * Escapes regex special characters in a keyword string.
 * Inputs: raw keyword string.
 * Outputs: escaped regex string.
 * Side effects: none.
 * Failure modes: returns empty string on non-string input.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches market symbols for a given text using strict word boundaries.
 * Case-insensitive, prevents false positives (e.g. "method" != "eth", "Golden" != "gold").
 * Inputs: text string to analyze.
 * Outputs: array of matched canonical symbols (e.g. ["BTCUSDT"]).
 * Side effects: none.
 * Failure modes: returns empty array on empty or invalid inputs.
 */
export function matchSymbolsForText(text: string): string[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  const matchedSymbols: string[] = [];

  for (const [symbol, keywords] of Object.entries(NEWS_KEYWORDS)) {
    const isMatched = keywords.some((kw) => {
      const pattern = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
      return pattern.test(text);
    });

    if (isMatched) {
      matchedSymbols.push(symbol);
    }
  }

  return matchedSymbols;
}
