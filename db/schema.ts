import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  jsonb,
  doublePrecision,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  pgSchema,
  bigint,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const privateSchema = pgSchema("private");

export const marketEnum = pgEnum("market", ["crypto", "gold", "forex"]);
export const timeframeEnum = pgEnum("timeframe", ["15m", "1h", "4h"]);
export const styleEnum = pgEnum("style", ["trend", "range"]);
export const sideEnum = pgEnum("side", ["buy", "sell"]);
export const statusEnum = pgEnum("status", [
  "open",
  "tp1",
  "tp2",
  "tp3",
  "sl",
  "be",
  "expired",
  "undecidable",
]);
export const engineEnum = pgEnum("engine", ["rules", "ai"]);

/**
 * signals — the permanent ledger. Rows are never deleted.
 */
export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    market: marketEnum("market").notNull(),
    timeframe: timeframeEnum("timeframe").notNull(),
    style: styleEnum("style").notNull(),
    side: sideEnum("side").notNull(),

    entry: doublePrecision("entry").notNull(),
    stopLoss: doublePrecision("stop_loss").notNull(),
    tp1: doublePrecision("tp1").notNull(),
    tp2: doublePrecision("tp2").notNull(),
    tp3: doublePrecision("tp3").notNull(),

    /** Heuristic confluence score (40-90), not a calibrated win probability. */
    confidence: integer("confidence").notNull(),
    strategyContext: jsonb("strategy_context").$type<Record<string, unknown>>(),
    engineConfigVersion: integer("engine_config_version").notNull().default(1),

    status: statusEnum("status").notNull().default("open"),
    engine: engineEnum("engine").notNull().default("rules"),

    entryFilled: boolean("entry_filled").notNull().default(false),
    rMultiple: doublePrecision("r_multiple"),
    exitPrice: doublePrecision("exit_price"),

    setupAt: timestamp("setup_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    openedAt: timestamp("opened_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    closedAt: timestamp("closed_at", { mode: "date", withTimezone: true }),
  },
  t => [
    uniqueIndex("signal_dedupe").on(t.symbol, t.timeframe, t.style, t.setupAt),
    index("status_idx").on(t.status),
    index("symbol_idx").on(t.symbol),
    index("opened_idx").on(t.openedAt),
    check(
      "signals_finite_levels_check",
      sql`${t.entry}::text not in ('NaN', 'Infinity', '-Infinity')
        and ${t.stopLoss}::text not in ('NaN', 'Infinity', '-Infinity')
        and ${t.tp1}::text not in ('NaN', 'Infinity', '-Infinity')
        and ${t.tp2}::text not in ('NaN', 'Infinity', '-Infinity')
        and ${t.tp3}::text not in ('NaN', 'Infinity', '-Infinity')`
    ),
    check(
      "signals_risk_geometry_check",
      sql`${t.entry} > 0 and (
        (${t.side} = 'buy' and ${t.stopLoss} < ${t.entry} and ${t.entry} < ${t.tp1}
          and ${t.tp1} <= ${t.tp2} and ${t.tp2} <= ${t.tp3})
        or
        (${t.side} = 'sell' and ${t.stopLoss} > ${t.entry} and ${t.entry} > ${t.tp1}
          and ${t.tp1} >= ${t.tp2} and ${t.tp2} >= ${t.tp3})
      )`
    ),
    check(
      "signals_finite_results_check",
      sql`(${t.exitPrice} is null or ${t.exitPrice}::text not in ('NaN', 'Infinity', '-Infinity'))
        and (${t.rMultiple} is null or ${t.rMultiple}::text not in ('NaN', 'Infinity', '-Infinity'))`
    ),
  ]
);

/**
 * scan_runs — the audit funnel.
 */
export const scanRuns = pgTable(
  "scan_runs",
  {
    id: serial("id").primaryKey(),
    ranAt: timestamp("ran_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    timeframe: timeframeEnum("timeframe").notNull(),
    candidates: integer("candidates").notNull().default(0),
    published: integer("published").notNull().default(0),
    note: varchar("note", { length: 255 }),
  },
  t => [index("ran_idx").on(t.ranAt)]
);

/**
 * news — 7-day rolling market headlines with automatic pruning.
 */
export const news = pgTable(
  "news",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    source: varchar("source", { length: 100 }).notNull(),
    sources: jsonb("sources").$type<string[]>(),
    summary: text("summary"),
    imageUrl: text("image_url"),
    matchedSymbols: jsonb("matched_symbols").$type<string[]>().notNull(),
    publishedAt: timestamp("published_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [index("news_published_idx").on(t.publishedAt)]
);

/**
 * Internal distributed leases used to coordinate serverless pipeline workers.
 * The private schema is not exposed through the Supabase Data API.
 */
export const pipelineLeases = privateSchema.table("pipeline_leases", {
  name: text("name").primaryKey(),
  owner: text("owner").notNull(),
  expiresAt: timestamp("expires_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Immutable, server-side lifecycle audit trail for every signal. */
export const signalEvents = privateSchema.table(
  "signal_events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    eventKey: text("event_key").notNull(),
    signalId: integer("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    price: doublePrecision("price"),
    occurredAt: timestamp("occurred_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex("signal_events_event_key_uidx").on(t.eventKey),
    index("signal_events_signal_occurred_idx").on(t.signalId, t.occurredAt),
    check(
      "signal_events_finite_price_check",
      sql`${t.price} is null or ${t.price}::text not in ('NaN', 'Infinity', '-Infinity')`
    ),
  ]
);

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;
export type ScanRun = typeof scanRuns.$inferSelect;
export type News = typeof news.$inferSelect;
export type InsertNews = typeof news.$inferInsert;
export type PipelineLease = typeof pipelineLeases.$inferSelect;
export type SignalEvent = typeof signalEvents.$inferSelect;
export type InsertSignalEvent = typeof signalEvents.$inferInsert;
