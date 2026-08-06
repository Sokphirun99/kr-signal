import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import type { Signal } from "@db/schema";

export interface SupabaseSignalFilters {
  symbol?: string;
  status?: string;
  closedOnly?: boolean;
}

export function computeTrackFromSignals(signals: (Signal | Record<string, unknown>)[]) {
  let closed = 0;
  let wins = 0;
  let nonWins = 0;
  let totalR = 0;
  let expired = 0;
  let undecidable = 0;

  for (const rawSignal of signals) {
    const s = rawSignal as Record<string, unknown>;
    const status = String(s.status ?? "");
    const r = Number(s.rMultiple ?? s.r_multiple ?? 0);
    if (status === "expired") {
      expired++;
    } else if (status === "undecidable") {
      undecidable++;
    } else if (["tp1", "tp2", "tp3", "sl", "be"].includes(status)) {
      closed++;
      totalR += r;
      if (r > 0) wins++;
      else nonWins++;
    }
  }

  const winRate = closed > 0 ? wins / closed : null;
  const avgR = closed > 0 ? Number((totalR / closed).toFixed(2)) : null;

  return {
    closed,
    wins,
    nonWins,
    winRate,
    totalR: Number(totalR.toFixed(2)),
    avgR,
    expired,
    undecidable,
    profitFactor: null,
    bestStreak: 0,
    currentStreak: 0,
    byMonth: [],
    byMarket: [],
    equityCurve: [],
    firstOutcomeAt: null,
    lastOutcomeAt: null,
  };
}

export function useSupabaseSignals(filters?: SupabaseSignalFilters) {
  const [supabaseSignals, setSupabaseSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const symbol = filters?.symbol;
  const status = filters?.status;
  const closedOnly = filters?.closedOnly;

  useEffect(() => {
    async function fetchFromSupabase() {
      setIsLoading(true);
      try {
        let q = supabase.from("signals").select("*").order("id", { ascending: false });
        if (symbol) {
          q = q.eq("symbol", symbol);
        }
        if (closedOnly) {
          q = q.not("status", "in", "(open,expired)");
        } else if (status && status !== "all") {
          q = q.eq("status", status);
        }
        const { data, error } = await q;
        if (data && !error) {
          setSupabaseSignals(data as unknown as Signal[]);
        }
      } catch (err) {
        console.error("Supabase fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchFromSupabase();
  }, [symbol, status, closedOnly]);

  return { supabaseSignals, isLoading };
}
