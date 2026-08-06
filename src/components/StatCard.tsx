import { cn } from "@/lib/utils";

export default function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "amber" | "red" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 shadow-xs transition-all hover:border-white/15">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-3xl font-semibold tracking-tight tabular-nums",
          accent === "green" && "text-emerald-400",
          accent === "amber" && "text-amber-400",
          accent === "red" && "text-red-400",
          (!accent || accent === "neutral") && "text-white",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-zinc-400 leading-normal">{sub}</p>}
    </div>
  );
}
