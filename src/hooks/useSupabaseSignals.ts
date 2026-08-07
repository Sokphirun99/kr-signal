import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import type { Signal } from "@db/schema";
import { INSTRUMENTS } from "@contracts/instruments";

const VALID_SYMBOLS = INSTRUMENTS.map((i) => i.symbol);

export interface SupabaseSignalFilters {
  symbol?: string;
  status?: string;
  closedOnly?: boolean;
  historyOnly?: boolean;
}

import { computeTrackRecordFromSignals } from "@contracts/trackRecord";

export function computeTrackFromSignals(signals: (Signal | Record<string, unknown>)[]) {
  return computeTrackRecordFromSignals(signals);
}

export function useSupabaseSignals(filters?: SupabaseSignalFilters) {
  const [supabaseSignals, setSupabaseSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const symbol = filters?.symbol;
  const status = filters?.status;
  const closedOnly = filters?.closedOnly;
  const historyOnly = filters?.historyOnly;

  useEffect(() => {
    async function fetchFromSupabase() {
      setIsLoading(true);
      try {
        let q = supabase
          .from("signals")
          .select("*")
          .in("symbol", VALID_SYMBOLS)
          .order("id", { ascending: false });
        if (symbol) {
          q = q.eq("symbol", symbol);
        }
        if (historyOnly) {
          q = q.neq("status", "open");
        } else if (closedOnly) {
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
  }, [symbol, status, closedOnly, historyOnly]);

  return { supabaseSignals, isLoading };
}
