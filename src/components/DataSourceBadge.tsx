import { cn } from "@/lib/utils";

export interface DataSourceBadgeProps {
  mode: "live" | "snapshot";
  liveLabel?: string;
  snapshotLabel?: string;
  className?: string;
}

const DEFAULT_LIVE_LABEL = "Live Feed · Auto-Refreshing";
const DEFAULT_SNAPSHOT_LABEL = "Snapshot mode · retrying";
const SNAPSHOT_TOOLTIP = "Live API unreachable — showing cached snapshot";

/**
 * Renders an indicator badge communicating whether the page is consuming live data or a cached snapshot.
 * Inputs: mode ("live" | "snapshot"), optional liveLabel, optional snapshotLabel, optional className.
 * Outputs: React JSX element with status dot and label.
 * Side effects: none (pure presentational component).
 * Failure modes: defaults to fallback labels if unspecified.
 */
export default function DataSourceBadge({
  mode,
  liveLabel = DEFAULT_LIVE_LABEL,
  snapshotLabel = DEFAULT_SNAPSHOT_LABEL,
  className,
}: DataSourceBadgeProps) {
  const isSnapshot = mode === "snapshot";
  const label = isSnapshot ? snapshotLabel : liveLabel;

  return (
    <div
      title={isSnapshot ? SNAPSHOT_TOOLTIP : undefined}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs transition-colors duration-200",
        isSnapshot
          ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
          : "border-white/10 bg-white/[0.03] text-zinc-400",
        className,
      )}
    >
      <span
        className={cn(
          "h-2 w-2 animate-pulse rounded-full",
          isSnapshot ? "bg-amber-400" : "bg-emerald-400",
        )}
      />
      <span>{label}</span>
    </div>
  );
}
