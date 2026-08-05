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
  accent?: "green" | "red" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-3xl font-semibold tracking-tight",
          accent === "green" && "text-emerald-400",
          accent === "red" && "text-red-400",
          (!accent || accent === "neutral") && "text-white",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}
