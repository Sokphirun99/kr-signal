/**
 * Re-export news aggregation engine, source registry, and deduplication modules.
 */

export * from "./news/index";
export { RSS_FEEDS as FEEDS } from "./news/sources/rss";
