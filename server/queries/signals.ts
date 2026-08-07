/**
 * Database query helpers for the signal ledger and scan funnel.
 */

import { getDb } from "./connection";
import { signals, scanRuns, type Signal } from "@db/schema";
import { and, desc, eq, ne, inArray, gte, sql } from "drizzle-orm";
import {
  CLOSED_STATUSES,
  INSTRUMENTS,
  type ClosedSignalRow,
  type SignalStatus,
} from "@contracts/instruments";

const VALID_SYMBOLS = INSTRUMENTS.map((i) => i.symbol);

export async function listSignals(filters?: {
  symbol?: string | null;
  status?: SignalStatus | null;
  closedOnly?: boolean | null;
  historyOnly?: boolean | null;
  limit?: number | null;
}) {
  const conditions = [inArray(signals.symbol, VALID_SYMBOLS)];
  if (filters?.symbol) conditions.push(eq(signals.symbol, filters.symbol));
  if (filters?.status) conditions.push(eq(signals.status, filters.status));
  if (filters?.closedOnly) conditions.push(inArray(signals.status, CLOSED_STATUSES));
  if (filters?.historyOnly) conditions.push(ne(signals.status, "open"));

  return await getDb()
    .select()
    .from(signals)
    .where(and(...conditions))
    .orderBy(desc(signals.openedAt))
    .limit(filters?.limit ?? 100);
}

/**
 * Fetches a single signal by its numerical ID, validating symbol is covered.
 * Inputs: id - integer signal ID.
 * Outputs: Signal record or null if not found.
 * Side effects: none.
 * Failure modes: returns null when ID doesn't exist or is not a covered instrument.
 */
export async function getSignalById(id: number): Promise<Signal | null> {
  const rows = await getDb()
    .select()
    .from(signals)
    .where(and(eq(signals.id, id), inArray(signals.symbol, VALID_SYMBOLS)))
    .limit(1);
  return rows[0] ?? null;
}

import { computeTrackRecordFromSignals, type TrackRecord } from "@contracts/trackRecord";
export type { TrackRecord, EquityCurvePoint } from "@contracts/trackRecord";

export async function computeTrackRecord(): Promise<TrackRecord> {
  const db = getDb();
  const validSignals = await db
    .select()
    .from(signals)
    .where(inArray(signals.symbol, VALID_SYMBOLS))
    .orderBy(signals.closedAt);

  const undecidableRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(signals)
    .where(and(inArray(signals.symbol, VALID_SYMBOLS), eq(signals.status, "undecidable")));
  const expiredRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(signals)
    .where(and(inArray(signals.symbol, VALID_SYMBOLS), eq(signals.status, "expired")));

  const closedRows: ClosedSignalRow[] = validSignals.map((s) => ({
    status: s.status as SignalStatus,
    rMultiple: Number(s.rMultiple ?? 0),
    market: s.market,
    closedAt: s.closedAt,
  }));

  return computeTrackRecordFromSignals(closedRows, {
    undecidable: Number(undecidableRows[0]?.n ?? 0),
    expired: Number(expiredRows[0]?.n ?? 0),
  });
}

export interface Funnel {
  scans: number;
  candidates: number;
  published: number;
  since: Date | null;
}

export async function computeFunnel(days = 7): Promise<Funnel> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await getDb()
    .select({
      scans: sql<number>`count(*)`,
      candidates: sql<number>`coalesce(sum(candidates),0)`,
      published: sql<number>`coalesce(sum(published),0)`,
    })
    .from(scanRuns)
    .where(gte(scanRuns.ranAt, since));
  const r = rows[0];
  return {
    scans: Number(r?.scans ?? 0),
    candidates: Number(r?.candidates ?? 0),
    published: Number(r?.published ?? 0),
    since,
  };
}
