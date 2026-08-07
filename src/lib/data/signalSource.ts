import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { useSupabaseSignals } from "@/hooks/useSupabaseSignals";
import type { SupabaseSignalFilters } from "@/hooks/useSupabaseSignals";
import type { ClientSignal } from "@contracts/instruments";

export type SignalSource = "live" | "snapshot" | "loading";

export interface SignalFilters {
  symbol?: string;
  status?: string;
  historyOnly?: boolean;
  limit?: number;
}

export interface UseSignalsResult {
  signals: ClientSignal[];
  isLoading: boolean;
  source: SignalSource;
}

/**
 * Unified signals data hook — resolves from tRPC first, falls back to Supabase.
 * Inputs: optional SignalFilters.
 * Outputs: { signals, isLoading, source } where source drives the DataSourceBadge.
 * Side effects: opens tRPC subscription (30s refetch) and conditionally a Supabase
 *   Realtime channel (15s polling fallback on channel error) when tRPC is unavailable.
 * Failure modes: returns empty signals array when both sources yield nothing.
 */
export function useSignals(filters?: SignalFilters): UseSignalsResult {
  const trpcQuery = trpc.signals.list.useQuery(
    {
      symbol: filters?.symbol,
      status: filters?.status,
      historyOnly: filters?.historyOnly,
      limit: filters?.limit ?? 100,
    },
    {
      refetchInterval: 30_000,
      retry: 2,
    },
  );

  const isFallbackNeeded = Boolean(
    trpcQuery.isError ||
      (!trpcQuery.isLoading && (!trpcQuery.data || trpcQuery.data.length === 0)),
  );

  const supabaseFilters: SupabaseSignalFilters = useMemo(
    () => ({
      enabled: isFallbackNeeded,
      symbol: filters?.symbol,
      status: filters?.status,
      historyOnly: filters?.historyOnly,
      limit: filters?.limit ?? 100,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isFallbackNeeded,
      filters?.symbol,
      filters?.status,
      filters?.historyOnly,
      filters?.limit,
    ],
  );

  const { supabaseSignals, isLoading: isSupabaseLoading } =
    useSupabaseSignals(supabaseFilters);

  return useMemo<UseSignalsResult>(() => {
    if (trpcQuery.data && trpcQuery.data.length > 0) {
      return {
        signals: trpcQuery.data as ClientSignal[],
        isLoading: false,
        source: "live",
      };
    }

    if (isFallbackNeeded && supabaseSignals.length > 0) {
      return {
        signals: supabaseSignals,
        isLoading: false,
        source: "snapshot",
      };
    }

    const isLoading =
      trpcQuery.isLoading || (isFallbackNeeded && isSupabaseLoading);

    return {
      signals: [],
      isLoading,
      source: "loading",
    };
  }, [
    trpcQuery.data,
    trpcQuery.isLoading,
    isFallbackNeeded,
    supabaseSignals,
    isSupabaseLoading,
  ]);
}
