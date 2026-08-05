import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  double,
  int,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * signals — the permanent ledger. Rows are never deleted: losing signals stay
 * in the table and in the win-rate denominator.
 *
 * Lifecycle: open → tp1 | tp2 | tp3 | sl | be | expired | undecidable
 * Only tp1/tp2/tp3/sl/be are market-graded outcomes (counted in stats).
 * Expired means no level was touched in time — reported but never graded.
 */
export const signals = mysqlTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    /** Canonical symbol from contracts/instruments (e.g. BTCUSDT, XAUUSD) */
    symbol: varchar("symbol", { length: 20 }).notNull(),
    market: mysqlEnum("market", ["crypto", "gold", "forex"]).notNull(),
    timeframe: mysqlEnum("timeframe", ["15m", "1h", "4h"]).notNull(),
    style: mysqlEnum("style", ["trend", "range"]).notNull(),
    side: mysqlEnum("side", ["buy", "sell"]).notNull(),

    entry: double("entry").notNull(),
    stopLoss: double("stop_loss").notNull(),
    tp1: double("tp1").notNull(),
    tp2: double("tp2").notNull(),
    tp3: double("tp3").notNull(),

    /** Heuristic confluence score 0–100 assigned by the engine */
    confidence: int("confidence").notNull(),

    status: mysqlEnum("status", [
      "open",
      "tp1",
      "tp2",
      "tp3",
      "sl",
      "be",
      "expired",
      "undecidable",
    ])
      .notNull()
      .default("open"),

    /** Which engine produced it — "rules" now, "ai" when the council ships */
    engine: mysqlEnum("engine", ["rules", "ai"]).notNull().default("rules"),

    /** Whether the entry price was actually touched on the tape */
    entryFilled: boolean("entry_filled").notNull().default(false),

    /** Realized R multiple at close (e.g. 1.5, -1.0). Null while open/expired */
    rMultiple: double("r_multiple"),

    /** Exit price that closed the signal, if any */
    exitPrice: double("exit_price"),

    /** Candle open time that generated the setup — part of the dedupe key */
    setupAt: timestamp("setup_at").notNull(),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    closedAt: timestamp("closed_at"),
  },
  (t) => [
    uniqueIndex("signal_dedupe").on(t.symbol, t.timeframe, t.style, t.setupAt),
    index("status_idx").on(t.status),
    index("symbol_idx").on(t.symbol),
    index("opened_idx").on(t.openedAt),
  ],
);

/**
 * scan_runs — the audit funnel. Every scanner pass is recorded so the
 * published-signals page can show scanned → candidate → published ratios.
 */
export const scanRuns = mysqlTable(
  "scan_runs",
  {
    id: serial("id").primaryKey(),
    ranAt: timestamp("ran_at").notNull().defaultNow(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    timeframe: mysqlEnum("timeframe", ["15m", "1h", "4h"]).notNull(),
    /** Setups the strategy produced before gating */
    candidates: int("candidates").notNull().default(0),
    /** Setups that passed every gate and were inserted */
    published: int("published").notNull().default(0),
    /** Why nothing was published, when published = 0 */
    note: varchar("note", { length: 255 }),
  },
  (t) => [index("ran_idx").on(t.ranAt)],
);

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;
export type ScanRun = typeof scanRuns.$inferSelect;
