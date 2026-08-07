import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { useSupabaseSignals, computeTrackFromSignals } from "@/hooks/useSupabaseSignals";

export type TrackRecordSource = "live" | "snapshot" | "loading";

/** Shape returned by the tRPC track record query or computed from Supabase signals. */
export type TrackRecord = NonNullable<
  ReturnType<typeof trpc.signals.trackRecord.useQuery>["data"]
>;

/** Shape returned by the tRPC funnel query. */
export type FunnelData = NonNullable<
  ReturnType<typeof trpc.signals.funnel.useQuery>["data"]
>;

export interface UseTrackRecordResult {
  trackRecord: TrackRecord | undefined;
  funnel: FunnelData | undefined;
  isLoading: boolean;
  source: TrackRecordSource;
}

/**
 * Unified track-record data hook — resolves from tRPC first, falls back to
 * computing the record from raw Supabase signals via computeTrackFromSignals.
 * Inputs: none.
 * Outputs: { trackRecord, isLoading, source } where source drives the DataSourceBadge.
 * Side effects: opens tRPC subscription (60s refetch) and conditionally a Supabase
 *   Realtime channel when tRPC is unavailable.
 * Failure modes: trackRecord is undefined while loading or when both sources fail.
 */
export function useTrackRecord(): UseTrackRecordResult {
  const trpcQuery = trpc.signals.trackRecord.useQuery(undefined, {
    refetchInterval: 60_000,
    retry: 2,
  });
  const funnelQuery = trpc.signals.funnel.useQuery();

  const isFallbackNeeded = Boolean(
    trpcQuery.isError || (!trpcQuery.isLoading && !trpcQuery.data),
  );

  const { supabaseSignals, isLoading: isSupabaseLoading } = useSupabaseSignals({
    enabled: isFallbackNeeded,
    limit: 200,
    historyOnly: true,
  });

  const fallbackTrack = useMemo(
    () => computeTrackFromSignals(supabaseSignals),
    [supabaseSignals],
  );

  return useMemo<UseTrackRecordResult>(() => {
    if (trpcQuery.data) {
      return {
        trackRecord: trpcQuery.data,
        funnel: funnelQuery.data,
        isLoading: false,
        source: "live",
      };
    }

    if (isFallbackNeeded && supabaseSignals.length > 0) {
      return {
        trackRecord: fallbackTrack as TrackRecord,
        funnel: funnelQuery.data,
        isLoading: false,
        source: "snapshot",
      };
    }

    const isLoading =
      trpcQuery.isLoading || (isFallbackNeeded && isSupabaseLoading);

    return {
      trackRecord: undefined,
      funnel: funnelQuery.data,
      isLoading,
      source: "loading",
    };
  }, [
    trpcQuery.data,
    trpcQuery.isLoading,
    funnelQuery.data,
    isFallbackNeeded,
    supabaseSignals,
    isSupabaseLoading,
    fallbackTrack,
  ]);
}
