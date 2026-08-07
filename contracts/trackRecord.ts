import {
  CLOSED_STATUSES,
  WIN_STATUSES,
  parseUtcDate,
  type SignalStatus,
  type ClosedSignalRow,
} from "./instruments";

export interface EquityCurvePoint {
  date: string;
  cumulativeR: number;
  tradeR: number;
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
  equityCurve: EquityCurvePoint[];
}

/**
 * Pure track-record computation shared between backend DB query and frontend fallback.
 * Ensures consistent stats, formulas, streaks, and equity curves across all data layers.
 * Inputs: rows — array of pre-mapped ClosedSignalRow in canonical camelCase;
 *         countsOverride — optional pre-counted undecidable/expired tallies.
 * Outputs: aggregate TrackRecord metrics.
 * Side effects: none (pure function).
 * Failure modes: returns zeroed metrics when input is empty.
 */
export function computeTrackRecordFromSignals(
  rows: ClosedSignalRow[],
  countsOverride?: { undecidable?: number; expired?: number },
): TrackRecord {
  const closedSignals: {
    status: SignalStatus;
    rMultiple: number;
    market: string;
    closedAt: Date | null;
  }[] = [];

  let undecidableCount = countsOverride?.undecidable ?? 0;
  let expiredCount = countsOverride?.expired ?? 0;

  for (const row of rows) {
    if (countsOverride === undefined) {
      if (row.status === "undecidable") undecidableCount++;
      if (row.status === "expired") expiredCount++;
    }

    if (CLOSED_STATUSES.includes(row.status)) {
      closedSignals.push({
        status: row.status,
        rMultiple: row.rMultiple,
        market: row.market,
        closedAt: row.closedAt ? parseUtcDate(row.closedAt) : null,
      });
    }
  }

  // Sort closed signals by closedAt ascending for equity curve and streaks
  closedSignals.sort((a, b) => {
    const timeA = a.closedAt ? a.closedAt.getTime() : 0;
    const timeB = b.closedAt ? b.closedAt.getTime() : 0;
    return timeA - timeB;
  });

  const wins = closedSignals.filter((s) => WIN_STATUSES.includes(s.status));
  const nonWins = closedSignals.length - wins.length;
  const winRate = closedSignals.length ? wins.length / closedSignals.length : null;

  const totalR = closedSignals.reduce((acc, s) => acc + s.rMultiple, 0);
  const avgR = closedSignals.length ? totalR / closedSignals.length : null;

  const grossWin = closedSignals
    .filter((s) => s.rMultiple > 0)
    .reduce((acc, s) => acc + s.rMultiple, 0);
  const grossLoss = Math.abs(
    closedSignals
      .filter((s) => s.rMultiple < 0)
      .reduce((acc, s) => acc + s.rMultiple, 0),
  );
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;

  let bestStreak = 0;
  let run = 0;
  for (const s of closedSignals) {
    if (WIN_STATUSES.includes(s.status)) {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }

  let currentStreak = 0;
  for (let i = closedSignals.length - 1; i >= 0; i--) {
    const isWin = WIN_STATUSES.includes(closedSignals[i].status);
    if (currentStreak === 0) currentStreak = isWin ? 1 : -1;
    else if ((currentStreak > 0) === isWin) currentStreak += currentStreak > 0 ? 1 : -1;
    else break;
  }

  const marketMap = new Map<string, { closed: number; wins: number }>();
  const monthMap = new Map<string, { closed: number; wins: number }>();

  for (const s of closedSignals) {
    const m = marketMap.get(s.market) ?? { closed: 0, wins: 0 };
    m.closed++;
    if (WIN_STATUSES.includes(s.status)) m.wins++;
    marketMap.set(s.market, m);

    if (s.closedAt) {
      const key = s.closedAt.toISOString().slice(0, 7); // YYYY-MM UTC
      const mm = monthMap.get(key) ?? { closed: 0, wins: 0 };
      mm.closed++;
      if (WIN_STATUSES.includes(s.status)) mm.wins++;
      monthMap.set(key, mm);
    }
  }

  let cumulative = 0;
  const equityCurve: EquityCurvePoint[] = closedSignals.map((s) => {
    const tradeR = Math.round(s.rMultiple * 100) / 100;
    cumulative = Math.round((cumulative + tradeR) * 100) / 100;
    return {
      date: s.closedAt ? s.closedAt.toISOString() : new Date().toISOString(),
      cumulativeR: cumulative,
      tradeR,
    };
  });

  return {
    closed: closedSignals.length,
    wins: wins.length,
    nonWins,
    undecidable: undecidableCount,
    expired: expiredCount,
    winRate,
    totalR: Math.round(totalR * 100) / 100,
    avgR: avgR === null ? null : Math.round(avgR * 100) / 100,
    profitFactor: profitFactor === null ? null : Math.round(profitFactor * 100) / 100,
    bestStreak,
    currentStreak,
    firstOutcomeAt: closedSignals[0]?.closedAt ?? null,
    lastOutcomeAt: closedSignals[closedSignals.length - 1]?.closedAt ?? null,
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
    equityCurve,
  };
}
