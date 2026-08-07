import type { NewsItem } from "@contracts/news";

const TIME_WINDOW_48H_MS = 48 * 60 * 60 * 1000;
const SIMILARITY_THRESHOLD = 0.6;

/**
 * Normalizes title string by converting to lowercase, stripping non-alphanumeric characters,
 * and collapsing consecutive whitespace.
 * Inputs: raw title string.
 * Outputs: normalized lowercase string.
 * Side effects: none.
 * Failure modes: returns empty string on empty input.
 */
export function normalizeTitle(title: string): string {
  if (!title || typeof title !== "string") return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits normalized text into a unique token set.
 * Inputs: normalized text string.
 * Outputs: Set of individual token words.
 * Side effects: none.
 * Failure modes: returns empty set for empty input.
 */
export function tokenizeTitle(normalized: string): Set<string> {
  if (!normalized) return new Set();
  const words = normalized.split(" ").filter((w) => w.length > 0);
  return new Set(words);
}

/**
 * Computes Jaccard similarity coefficient between two word token sets.
 * Jaccard = |A ∩ B| / |A ∪ B|.
 * Inputs: setA and setB of word strings.
 * Outputs: number between 0.0 and 1.0.
 * Side effects: none.
 * Failure modes: returns 0 if both sets are empty.
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  if (unionCount === 0) return 0;

  return intersectionCount / unionCount;
}

/**
 * Merges two related NewsItem objects into a single composite entry.
 * Inputs: baseItem and newItem to merge.
 * Outputs: combined NewsItem with earliest date, unioned sources, and longest summary.
 * Side effects: none.
 * Failure modes: none.
 */
export function mergeNewsItems(a: NewsItem, b: NewsItem): NewsItem {
  const dateA = new Date(a.publishedAt).getTime();
  const dateB = new Date(b.publishedAt).getTime();
  const isAEarliest = isNaN(dateB) || (!isNaN(dateA) && dateA <= dateB);

  const primary = isAEarliest ? a : b;

  const rawSourcesA = a.sources && a.sources.length > 0 ? a.sources : [a.source];
  const rawSourcesB = b.sources && b.sources.length > 0 ? b.sources : [b.source];
  const combinedSources = Array.from(new Set([...rawSourcesA, ...rawSourcesB]));

  const combinedSymbols = Array.from(
    new Set([...(a.matchedSymbols ?? []), ...(b.matchedSymbols ?? [])]),
  );

  const summaryA = a.summary?.trim() || "";
  const summaryB = b.summary?.trim() || "";
  const bestSummary =
    summaryA.length >= summaryB.length
      ? a.summary || null
      : b.summary || null;

  const bestImage = a.imageUrl || b.imageUrl || null;

  return {
    id: primary.id,
    title: primary.title,
    url: primary.url,
    source: combinedSources.join(" · "),
    sources: combinedSources,
    publishedAt: primary.publishedAt,
    summary: bestSummary,
    imageUrl: bestImage,
    matchedSymbols: combinedSymbols,
  };
}

/**
 * Deduplicates news articles across multiple aggregator sources.
 *
 * Algorithm:
 * 1. Exact URL deduplication first.
 * 2. Title clustering using token-set Jaccard similarity (>= 0.6) within a 48-hour time window.
 *
 * Complexity:
 * Note: n <= ~300 items so O(n²) within time buckets is <2ms — acceptable and simple.
 *
 * Inputs: raw NewsItem array from all active providers.
 * Outputs: deduplicated NewsItem array with consolidated sources.
 * Side effects: none.
 * Failure modes: returns empty array on empty input.
 */
export function dedupeNews(items: NewsItem[]): NewsItem[] {
  if (!items || items.length === 0) {
    return [];
  }

  // Step 1: Exact URL deduplication
  const urlMap = new Map<string, NewsItem>();
  for (const item of items) {
    const normUrl = item.url.trim().toLowerCase().replace(/\/+$/, "");
    const existing = urlMap.get(normUrl);
    if (!existing) {
      urlMap.set(normUrl, {
        ...item,
        sources: item.sources && item.sources.length > 0 ? item.sources : [item.source],
      });
    } else {
      urlMap.set(normUrl, mergeNewsItems(existing, item));
    }
  }

  const urlDeduped = Array.from(urlMap.values());

  // Step 2: Title clustering with Jaccard similarity within a 48h sliding window
  const clusters: { item: NewsItem; tokens: Set<string>; time: number }[] = [];

  for (const current of urlDeduped) {
    const normTitle = normalizeTitle(current.title);
    const tokens = tokenizeTitle(normTitle);
    const currentTime = new Date(current.publishedAt).getTime();

    let matchedClusterIndex = -1;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const timeDiff = Math.abs(currentTime - cluster.time);

      if (timeDiff <= TIME_WINDOW_48H_MS) {
        const similarity = jaccardSimilarity(tokens, cluster.tokens);
        if (similarity >= SIMILARITY_THRESHOLD) {
          matchedClusterIndex = i;
          break;
        }
      }
    }

    if (matchedClusterIndex >= 0) {
      const existing = clusters[matchedClusterIndex];
      const merged = mergeNewsItems(existing.item, current);
      clusters[matchedClusterIndex] = {
        item: merged,
        tokens: tokenizeTitle(normalizeTitle(merged.title)),
        time: new Date(merged.publishedAt).getTime(),
      };
    } else {
      clusters.push({
        item: current,
        tokens,
        time: isNaN(currentTime) ? Date.now() : currentTime,
      });
    }
  }

  return clusters.map((c) => c.item);
}
