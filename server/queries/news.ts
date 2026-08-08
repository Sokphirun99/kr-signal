/**
 * Database query helpers for the news table and 7-day retention management.
 */

import { getDb } from "./connection";
import { news, type InsertNews } from "@db/schema";
import { desc, gte, lt } from "drizzle-orm";
import type { NewsItem } from "@contracts/news";

/**
 * Upserts a batch of market news articles into the database.
 * Deduplicates automatically against existing URLs.
 *
 * Inputs: items - array of NewsItem objects.
 * Outputs: number of successfully stored items.
 * Side effects: writes to public.news table.
 * Failure modes: returns 0 on empty array or DB error; does not throw.
 */
export async function upsertNewsBatch(items: NewsItem[]): Promise<number> {
  if (!items || items.length === 0) return 0;

  const rows: InsertNews[] = items.map((item) => ({
    url: item.url,
    title: item.title,
    source: item.source.slice(0, 100),
    sources: item.sources ?? [item.source],
    summary: item.summary ?? null,
    imageUrl: item.imageUrl ?? null,
    matchedSymbols: item.matchedSymbols,
    publishedAt: new Date(item.publishedAt),
  }));

  try {
    const result = await getDb()
      .insert(news)
      .values(rows)
      .onConflictDoNothing({ target: news.url });

    return result.length;
  } catch (err) {
    console.error("[news] Failed to upsert news batch:", err);
    return 0;
  }
}

/**
 * Retrieves news published strictly within the last 7 days.
 *
 * Inputs: limit - maximum number of items (default 60).
 * Outputs: array of NewsItem objects.
 * Side effects: none.
 * Failure modes: returns empty array on error.
 */
export async function getRecentNewsFromDb(limit = 60): Promise<NewsItem[]> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await getDb()
      .select()
      .from(news)
      .where(gte(news.publishedAt, sevenDaysAgo))
      .orderBy(desc(news.publishedAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.url,
      url: row.url,
      title: row.title,
      source: row.source,
      sources: row.sources ?? [row.source],
      summary: row.summary,
      imageUrl: row.imageUrl,
      matchedSymbols: row.matchedSymbols,
      publishedAt: row.publishedAt.toISOString(),
    }));
  } catch (err) {
    console.error("[news] Failed to read news from DB:", err);
    return [];
  }
}

/**
 * Automatically purges any news articles older than 7 days.
 * Enforces strict 7-day rolling window to keep DB footprint minimal.
 *
 * Inputs: none.
 * Outputs: count of deleted records.
 * Side effects: deletes matching rows from public.news.
 * Failure modes: returns 0 on error; never throws.
 */
export async function pruneNewsOlderThan7Days(): Promise<number> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const deleted = await getDb()
      .delete(news)
      .where(lt(news.publishedAt, sevenDaysAgo))
      .returning({ id: news.id });

    if (deleted.length > 0) {
      console.log(`[news] Pruned ${deleted.length} obsolete news items older than 7 days.`);
    }

    return deleted.length;
  } catch (err) {
    console.error("[news] Failed to prune old news:", err);
    return 0;
  }
}
