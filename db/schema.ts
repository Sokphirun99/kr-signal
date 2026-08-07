import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  doublePrecision,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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

    confidence: integer("confidence").notNull(),

    status: statusEnum("status").notNull().default("open"),
    engine: engineEnum("engine").notNull().default("rules"),

    entryFilled: boolean("entry_filled").notNull().default(false),
    rMultiple: doublePrecision("r_multiple"),
    exitPrice: doublePrecision("exit_price"),

    setupAt: timestamp("setup_at", { mode: "date", withTimezone: true }).notNull(),
    openedAt: timestamp("opened_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { mode: "date", withTimezone: true }),
  },
  (t) => [
    uniqueIndex("signal_dedupe").on(t.symbol, t.timeframe, t.style, t.setupAt),
    index("status_idx").on(t.status),
    index("symbol_idx").on(t.symbol),
    index("opened_idx").on(t.openedAt),
  ],
);

/**
 * scan_runs — the audit funnel.
 */
export const scanRuns = pgTable(
  "scan_runs",
  {
    id: serial("id").primaryKey(),
    ranAt: timestamp("ran_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    timeframe: timeframeEnum("timeframe").notNull(),
    candidates: integer("candidates").notNull().default(0),
    published: integer("published").notNull().default(0),
    note: varchar("note", { length: 255 }),
  },
  (t) => [index("ran_idx").on(t.ranAt)],
);

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;
export type ScanRun = typeof scanRuns.$inferSelect;


