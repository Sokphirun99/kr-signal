/**
 * Database query helpers for the signal ledger and scan funnel.
 */

import { getDb } from "./connection";
import { signals, scanRuns } from "@db/schema";
import { and, desc, eq, inArray, gte, sql } from "drizzle-orm";
import {
  CLOSED_STATUSES,
  WIN_STATUSES,
  type SignalStatus,
} from "@contracts/instruments";

export async function listSignals(filters: {
  symbol?: string;
  status?: SignalStatus;
  closedOnly?: boolean;
  limit?: number;
}) {
  const conditions = [];
  if (filters.symbol) conditions.push(eq(signals.symbol, filters.symbol));
  if (filters.status) conditions.push(eq(signals.status, filters.status));
  if (filters.closedOnly) conditions.push(inArray(signals.status, CLOSED_STATUSES));

  return getDb()
    .select()
    .from(signals)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(signals.openedAt))
    .limit(filters.limit ?? 100);
}

export interface TrackRecord {
  closed: number;
  wins: number;
  nonWins: number;
  undecidable: number;
  expired: number;
  winRate: number | null;
  totalR: number;
  avgR: number | null;
  profitFactor: number | null;
  bestStreak: number;
  currentStreak: number;
  firstOutcomeAt: Date | null;
  lastOutcomeAt: Date | null;
  byMarket: { market: string; closed: number; wins: number; winRate: number | null }[];
  byMonth: { month: string; closed: number; wins: number; winRate: number | null }[];
}

export async function computeTrackRecord(): Promise<TrackRecord> {
  const db = getDb();
  const closed = await db
    .select()
    .from(signals)
    .where(inArray(signals.status, CLOSED_STATUSES))
    .orderBy(signals.closedAt);

  const undecidableRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(signals)
    .where(eq(signals.status, "undecidable"));
  const expiredRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(signals)
    .where(eq(signals.status, "expired"));

  const wins = closed.filter((s) => WIN_STATUSES.includes(s.status));
  const nonWins = closed.length - wins.length;
  const winRate = closed.length ? wins.length / closed.length : null;

  const totalR = closed.reduce((acc, s) => acc + (s.rMultiple ?? 0), 0);
  const avgR = closed.length ? totalR / closed.length : null;

  const grossWin = closed
    .filter((s) => (s.rMultiple ?? 0) > 0)
    .reduce((acc, s) => acc + (s.rMultiple ?? 0), 0);
  const grossLoss = Math.abs(
    closed
      .filter((s) => (s.rMultiple ?? 0) < 0)
      .reduce((acc, s) => acc + (s.rMultiple ?? 0), 0),
  );
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : closed.length ? null : null;

  // Streaks over closed signals in chronological order
  let bestStreak = 0;
  let run = 0;
  for (const s of closed) {
    if (WIN_STATUSES.includes(s.status)) {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }
  // Current streak: trailing wins (positive) or losses (negative)
  let currentStreak = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    const isWin = WIN_STATUSES.includes(closed[i].status);
    if (currentStreak === 0) currentStreak = isWin ? 1 : -1;
    else if ((currentStreak > 0) === isWin) currentStreak += currentStreak > 0 ? 1 : -1;
    else break;
  }

  const marketMap = new Map<string, { closed: number; wins: number }>();
  const monthMap = new Map<string, { closed: number; wins: number }>();
  for (const s of closed) {
    const m = marketMap.get(s.market) ?? { closed: 0, wins: 0 };
    m.closed++;
    if (WIN_STATUSES.includes(s.status)) m.wins++;
    marketMap.set(s.market, m);

    if (s.closedAt) {
      const key = s.closedAt.toISOString().slice(0, 7); // YYYY-MM
      const mm = monthMap.get(key) ?? { closed: 0, wins: 0 };
      mm.closed++;
      if (WIN_STATUSES.includes(s.status)) mm.wins++;
      monthMap.set(key, mm);
    }
  }

  return {
    closed: closed.length,
    wins: wins.length,
    nonWins,
    undecidable: Number(undecidableRows[0]?.n ?? 0),
    expired: Number(expiredRows[0]?.n ?? 0),
    winRate,
    totalR: Math.round(totalR * 100) / 100,
    avgR: avgR === null ? null : Math.round(avgR * 100) / 100,
    profitFactor: profitFactor === null ? null : Math.round(profitFactor * 100) / 100,
    bestStreak,
    currentStreak,
    firstOutcomeAt: closed[0]?.closedAt ?? null,
    lastOutcomeAt: closed[closed.length - 1]?.closedAt ?? null,
    byMarket: [...marketMap.entries()].map(([market, v]) => ({
      market,
      ...v,
      winRate: v.closed ? v.wins / v.closed : null,
    })),
    byMonth: [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        ...v,
        winRate: v.closed ? v.wins / v.closed : null,
      })),
  };
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
