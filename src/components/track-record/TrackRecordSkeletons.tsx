import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton placeholder for stat summary metric cards.
 * Inputs: none.
 * Outputs: React JSX skeleton card.
 * Side effects: none.
 * Failure modes: none.
 */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-9 w-20" />
      <Skeleton className="mt-2 h-3 w-36" />
    </div>
  );
}

/**
 * Loading skeleton placeholder for the equity curve chart area.
 * Inputs: none.
 * Outputs: React JSX skeleton chart container.
 * Side effects: none.
 * Failure modes: none.
 */
export function EquityCurveSkeleton() {
  return (
    <div className="mt-8 rounded-xl border border-white/5 bg-white/[0.02] p-6">
      <div className="mb-5 flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
      <div className="relative h-[280px] w-full overflow-hidden rounded-lg">
        <Skeleton className="h-full w-full" />
        <div className="absolute inset-0 flex flex-col justify-between px-0 py-4 pointer-events-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-px w-full bg-white/[0.04]" />
          ))}
        </div>
      </div>
    </div>
  );
}
