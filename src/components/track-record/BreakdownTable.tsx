import { cn } from "@/lib/utils";

export interface BreakdownRow {
  key: string;
  label: string;
  closed: number;
  wins: number;
  winRate: number | null;
}

export interface BreakdownTableProps {
  title: string;
  labelHeader: string;
  rows: BreakdownRow[];
  isCapitalized?: boolean;
  showSampleSizeUnder10?: boolean;
}

function pct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

/**
 * Reusable breakdown data table for rendering categorized win-rate and outcome statistics.
 * Inputs: props specifying title, column header, row data, and formatting flags.
 * Outputs: React JSX table element.
 * Side effects: none.
 * Failure modes: none.
 */
export function BreakdownTable({
  title,
  labelHeader,
  rows,
  isCapitalized = false,
  showSampleSizeUnder10 = false,
}: BreakdownTableProps) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-10 overflow-hidden rounded-xl border border-white/10 shadow-xs">
      <div className="bg-white/[0.04] px-5 py-3 border-b border-white/10">
        <h3 className="font-semibold text-white text-sm">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wider text-zinc-400">
            <th className="px-5 py-3 font-medium">{labelHeader}</th>
            <th className="px-5 py-3 font-medium">Closed</th>
            <th className="px-5 py-3 font-medium">Wins</th>
            <th className="px-5 py-3 font-medium">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
              <td
                className={cn(
                  "px-5 py-3 text-zinc-200",
                  isCapitalized
                    ? "capitalize font-medium"
                    : "font-mono tabular-nums",
                )}
              >
                {row.label}
              </td>
              <td className="px-5 py-3 font-mono text-zinc-300 tabular-nums">{row.closed}</td>
              <td className="px-5 py-3 font-mono text-zinc-300 tabular-nums">{row.wins}</td>
              <td className="px-5 py-3 font-mono text-emerald-400 tabular-nums font-semibold">
                {showSampleSizeUnder10 && row.closed < 10
                  ? `${pct(row.winRate)} (n=${row.closed})`
                  : pct(row.winRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
