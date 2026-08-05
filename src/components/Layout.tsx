import { Link, useLocation } from "react-router";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/signals", label: "Signals" },
  { to: "/track-record", label: "Track Record" },
  { to: "/methodology", label: "Methodology" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-[#070a08] text-zinc-200 antialiased">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#070a08]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
              <Activity className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight text-white">
              KR<span className="text-emerald-400">-Signal</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  pathname === n.to
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-20">{children}</main>
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto max-w-6xl px-4 text-xs leading-relaxed text-zinc-500">
          <p>
            KR-Signal publishes rule-based trade setups for education and market
            analysis. Nothing here is financial advice. Trading involves
            substantial risk — you can lose money. Gold and forex feeds use
            Binance-listed proxy pairs (PAXG, EUR/GBP vs USDT), so a small basis
            versus spot markets applies.
          </p>
          <p className="mt-2">Every published signal stays in the ledger permanently — wins and losses alike.</p>
        </div>
      </footer>
    </div>
  );
}
