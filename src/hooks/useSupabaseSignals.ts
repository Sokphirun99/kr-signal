import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import type { ClientSignal, ClosedSignalRow } from "@contracts/instruments";
import { INSTRUMENTS } from "@contracts/instruments";
import { computeTrackRecordFromSignals } from "@contracts/trackRecord";

const VALID_SYMBOLS = INSTRUMENTS.map((i) => i.symbol);
const DEFAULT_SIGNAL_LIMIT = 100;
const BASE_POLL_INTERVAL_MS = 15_000;
const POLL_JITTER_MAX_MS = 3_000;
const REALTIME_DEBOUNCE_MS = 2_000;
const REALTIME_CHANNEL_NAME = "signals-feed";
const DEFAULT_FINGERPRINT = "0:0";

export interface SupabaseSignalFilters {
  symbol?: string;
  status?: string;
  closedOnly?: boolean;
  historyOnly?: boolean;
  limit?: number;
  enabled?: boolean;
}

/**
 * Maps raw Supabase snake_case rows into ClosedSignalRow and computes track record.
 * Inputs: signals array from Supabase (snake_case or camelCase rows).
 * Outputs: Computed TrackRecord object.
 * Side effects: none.
 * Failure modes: returns zeroed metrics on empty input.
 */
export function computeTrackFromSignals(signals: ClientSignal[]) {
  const mapped: ClosedSignalRow[] = signals.map((s) => {
    const raw = s as unknown as Record<string, unknown>;
    return {
      status: (raw.status ?? "open") as ClosedSignalRow["status"],
      rMultiple: Number(raw.rMultiple ?? raw.r_multiple ?? 0),
      market: String(raw.market ?? "crypto"),
      closedAt: (raw.closedAt ?? raw.closed_at ?? null) as string | null,
    };
  });
  return computeTrackRecordFromSignals(mapped);
}

function getJitteredPollDelay(): number {
  return BASE_POLL_INTERVAL_MS + Math.floor(Math.random() * POLL_JITTER_MAX_MS);
}

/**
 * Generates an ETag-style fingerprint from signal count and maximum row ID.
 * Inputs: signals array.
 * Outputs: string formatted as `count:maxId`.
 * Side effects: none.
 * Failure modes: returns "0:0" on empty list.
 */
export function computeSignalFingerprint(signals: ClientSignal[]): string {
  if (signals.length === 0) return DEFAULT_FINGERPRINT;
  let maxId = 0;
  for (let i = 0; i < signals.length; i++) {
    const id = signals[i].id;
    if (id > maxId) maxId = id;
  }
  return `${signals.length}:${maxId}`;
}

function buildSignalsQuery(filters?: SupabaseSignalFilters) {
  const limit = filters?.limit ?? DEFAULT_SIGNAL_LIMIT;
  let q = supabase
    .from("signals")
    .select("*")
    .in("symbol", VALID_SYMBOLS)
    .order("openedAt", { ascending: false })
    .limit(limit);

  if (filters?.symbol) {
    q = q.eq("symbol", filters.symbol);
  }
  if (filters?.historyOnly) {
    return q.neq("status", "open");
  }
  if (filters?.closedOnly) {
    return q.not("status", "in", "(open,expired)");
  }
  if (filters?.status && filters.status !== "all") {
    return q.eq("status", filters.status);
  }
  return q;
}

/**
 * Custom hook to lazily subscribe to Supabase Realtime signals with fallback polling, jitter, and visibility gating.
 * Note: Realtime replication must be enabled for the `signals` table in Supabase Dashboard (Database -> Replication).
 * Inputs: optional SupabaseSignalFilters object.
 * Outputs: { supabaseSignals: Signal[], isLoading: boolean }.
 * Side effects: opens Realtime channel, attaches visibility listeners, and runs jittered polling fallback on channel error.
 * Failure modes: catches network errors, logs to console, and retains current state.
 */
export function useSupabaseSignals(filters?: SupabaseSignalFilters) {
  const [supabaseSignals, setSupabaseSignals] = useState<ClientSignal[]>([]);
  const isEnabled = filters?.enabled ?? true;
  const [isLoading, setIsLoading] = useState<boolean>(isEnabled);
  const inFlightRef = useRef<boolean>(false);
  const fingerprintRef = useRef<string>(DEFAULT_FINGERPRINT);
  const isPollingActiveRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    let isMounted = true;

    async function executeFetch(isInitial = false): Promise<void> {
      if (inFlightRef.current) return;
      if (document.visibilityState === "hidden" && !isInitial) return;

      inFlightRef.current = true;
      if (isInitial) setIsLoading(true);
      try {
        const { data, error } = await buildSignalsQuery(filters);
        if (isMounted && data && !error) {
          const nextSignals = data as unknown as ClientSignal[];
          const nextFingerprint = computeSignalFingerprint(nextSignals);
          if (fingerprintRef.current !== nextFingerprint) {
            fingerprintRef.current = nextFingerprint;
            setSupabaseSignals(nextSignals);
          }
        }
      } catch (err: unknown) {
        console.error("Supabase fetch error:", err);
      } finally {
        inFlightRef.current = false;
        if (isMounted && isInitial) setIsLoading(false);
      }
    }

    function scheduleDebouncedFetch(): void {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void executeFetch(false);
      }, REALTIME_DEBOUNCE_MS);
    }

    function scheduleNextPoll(): void {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(() => {
        pollTimerRef.current = null;
        if (document.visibilityState === "visible") {
          void executeFetch(false);
        }
        if (isPollingActiveRef.current) {
          scheduleNextPoll();
        }
      }, getJitteredPollDelay());
    }

    function startPollingFallback(): void {
      if (isPollingActiveRef.current) return;
      isPollingActiveRef.current = true;
      scheduleNextPoll();
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void executeFetch(false);
        if (isPollingActiveRef.current) {
          scheduleNextPoll();
        }
      } else if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    executeFetch(true);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channel = supabase
      .channel(REALTIME_CHANNEL_NAME)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals" },
        () => {
          scheduleDebouncedFetch();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          startPollingFallback();
        }
      });

    return () => {
      isMounted = false;
      isPollingActiveRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [
    isEnabled,
    filters?.symbol,
    filters?.status,
    filters?.closedOnly,
    filters?.historyOnly,
    filters?.limit,
  ]);

  return { supabaseSignals, isLoading };
}
