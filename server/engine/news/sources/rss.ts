import { matchSymbolsForText, type NewsItem } from "@contracts/news";
import { parseUtcDate } from "@contracts/instruments";
import type { NewsSource } from "../types";
import { FEED_TIMEOUT_MS, SOURCE_CACHE_TTL_MS, MAX_SUMMARY_LENGTH } from "../types";

export interface FeedConfig {
  name: string;
  url: string;
}

export const RSS_FEEDS: readonly FeedConfig[] = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
] as const;

/**
 * Decodes standard XML and HTML entities from raw RSS text.
 * Inputs: raw text string.
 * Outputs: decoded plain text string.
 * Side effects: none.
 * Failure modes: returns empty string on invalid input.
 */
export function decodeXmlEntities(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

/**
 * Strips HTML tags and excessive whitespace from a string.
 * Inputs: HTML string.
 * Outputs: clean plain text.
 * Side effects: none.
 * Failure modes: returns empty string on invalid input.
 */
export function stripHtmlTags(html: string): string {
  if (!html || typeof html !== "string") return "";
  const unwrapCdata = decodeXmlEntities(html);
  return unwrapCdata
    .replace(/<[^>]*>?/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Truncates text cleanly to a maximum length with ellipsis.
 * Inputs: text string, maxLength number.
 * Outputs: truncated string or null.
 * Side effects: none.
 * Failure modes: returns null if input is empty.
 */
export function truncateSummary(
  text: string | null,
  maxLength = MAX_SUMMARY_LENGTH,
): string | null {
  if (!text) return null;
  const clean = text.trim();
  if (!clean) return null;
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 3).trim()}...`;
}

/**
 * Extracts tag content or attribute from an XML block.
 * Inputs: chunk string, tag names to try.
 * Outputs: content string or null.
 * Side effects: none.
 * Failure modes: returns null when no matching tag found.
 */
function extractTagContent(chunk: string, tags: string[]): string | null {
  for (const tag of tags) {
    const contentMatch = new RegExp(
      `<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i",
    ).exec(chunk);
    if (contentMatch?.[1]) {
      return contentMatch[1];
    }
    const attrMatch = new RegExp(
      `<${tag}[^>]*\\bhref=["']([^"']+)["']`,
      "i",
    ).exec(chunk);
    if (attrMatch?.[1]) {
      return attrMatch[1];
    }
  }
  return null;
}

/**
 * Extracts a valid HTTP/HTTPS image URL from XML elements or enclosures.
 * Inputs: chunk string.
 * Outputs: image URL string or null.
 * Side effects: none.
 * Failure modes: returns null when no valid image URL found.
 */
export function extractImageUrl(chunk: string): string | null {
  if (!chunk || typeof chunk !== "string") return null;

  const patterns = [
    /<media:thumbnail[^>]+url=["'](https?:\/\/[^"']+)["']/i,
    /<media:content[^>]+url=["'](https?:\/\/[^"']+)["']/i,
    /<enclosure[^>]+url=["'](https?:\/\/[^"']+)["'][^>]*type=["']image\//i,
    /<enclosure[^>]*type=["']image\/[^"']*["'][^>]+url=["'](https?:\/\/[^"']+)["']/i,
    /<img[^>]+src=["'](https?:\/\/[^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(chunk);
    if (match?.[1]) {
      return decodeXmlEntities(match[1]).trim();
    }
  }

  return null;
}

/**
 * Parses raw RSS XML content into normalized NewsItem objects.
 * Inputs: xml string, source name.
 * Outputs: array of NewsItem.
 * Side effects: none.
 * Failure modes: returns empty array on invalid XML structure.
 */
export function parseRssFeed(xml: string, sourceName: string): NewsItem[] {
  if (!xml || typeof xml !== "string") return [];

  const itemRegex = /<(?:item|entry)(?:[\s>][\s\S]*?<\/(?:item|entry)>|[\s\S]*?$)/gi;
  const matches = xml.match(itemRegex) ?? [];
  const items: NewsItem[] = [];

  for (const chunk of matches) {
    const rawTitle = extractTagContent(chunk, ["title"]) ?? "";
    const rawLink = extractTagContent(chunk, ["link", "guid"]) ?? "";
    const rawPubDate =
      extractTagContent(chunk, ["pubDate", "dc:date", "published", "updated"]) ?? "";
    const rawDesc =
      extractTagContent(chunk, ["description", "content:encoded", "summary"]) ?? "";

    const title = decodeXmlEntities(rawTitle);
    const url = decodeXmlEntities(rawLink).replace(/<[^>]*>/g, "").trim();
    if (!title || !url) continue;

    const summaryText = stripHtmlTags(rawDesc);
    const summary = truncateSummary(summaryText, MAX_SUMMARY_LENGTH);
    const publishedAt = parseUtcDate(rawPubDate).toISOString();
    const matchedSymbols = matchSymbolsForText(`${title} ${summaryText}`);
    const imageUrl = extractImageUrl(chunk);

    items.push({
      id: url,
      title,
      url,
      source: sourceName,
      sources: [sourceName],
      publishedAt,
      summary,
      imageUrl,
      matchedSymbols,
    });
  }

  return items;
}

/**
 * Fetches and parses a single RSS news feed with timeout protection.
 * Inputs: feed url, source name.
 * Outputs: array of parsed NewsItems.
 * Side effects: executes HTTP GET request.
 * Failure modes: rejects on network failure or abort timeout.
 */
export async function fetchNewsFeed(
  url: string,
  sourceName: string,
): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching RSS from ${sourceName}`);
    }

    const xml = await response.text();
    return parseRssFeed(xml, sourceName);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * NewsSource implementation for standard financial and crypto RSS feeds.
 */
export class RssNewsSource implements NewsSource {
  public readonly name = "RSS Feeds";
  private cache: { items: NewsItem[]; fetchedAt: number } | null = null;

  /**
   * Fetches news from all configured RSS feeds with 30-min per-source caching.
   * Inputs: forceRefresh optional boolean.
   * Outputs: Promise resolving to array of NewsItems.
   * Side effects: network fetch to RSS endpoints.
   * Failure modes: serves stale cache on partial/full failures; never throws.
   */
  async fetch(forceRefresh = false): Promise<NewsItem[]> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cache &&
      now - this.cache.fetchedAt < SOURCE_CACHE_TTL_MS
    ) {
      return this.cache.items;
    }

    try {
      const settled = await Promise.allSettled(
        RSS_FEEDS.map((feed) => fetchNewsFeed(feed.url, feed.name)),
      );

      const items: NewsItem[] = [];
      for (const res of settled) {
        if (res.status === "fulfilled") {
          items.push(...res.value);
        }
      }

      if (items.length > 0) {
        this.cache = { items, fetchedAt: now };
        return items;
      }
    } catch {
      // Handled below with stale cache fallback
    }

    if (this.cache) {
      return this.cache.items;
    }

    return [];
  }
}
