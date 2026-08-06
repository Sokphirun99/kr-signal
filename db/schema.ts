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
  uuid,
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
export const roleEnum = pgEnum("role", ["user", "admin"]);

/**
 * users — application user table.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 100 }),
    role: roleEnum("role").notNull().default("user"),
    isActive: boolean("is_active").notNull().default(true),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { mode: "date" }),
    lastLoginAt: timestamp("last_login_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);

/**
 * sessions — session token ledger.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

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

    setupAt: timestamp("setup_at", { mode: "date" }).notNull(),
    openedAt: timestamp("opened_at", { mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    closedAt: timestamp("closed_at", { mode: "date" }),
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
    ranAt: timestamp("ran_at", { mode: "date" }).notNull().defaultNow(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    timeframe: timeframeEnum("timeframe").notNull(),
    candidates: integer("candidates").notNull().default(0),
    published: integer("published").notNull().default(0),
    note: varchar("note", { length: 255 }),
  },
  (t) => [index("ran_idx").on(t.ranAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;
export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;
export type ScanRun = typeof scanRuns.$inferSelect;

