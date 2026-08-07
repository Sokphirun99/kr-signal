import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Activity, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import GlowThreadsBackground from "@/components/GlowThreadsBackground";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/signals", label: "Signals" },
  { to: "/track-record", label: "Track Record" },
  { to: "/methodology", label: "Methodology" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#070a08] text-zinc-200 antialiased selection:bg-emerald-500/30 selection:text-emerald-200 overflow-hidden">
      {/* WebGL Glow Threads Background */}
      <GlowThreadsBackground
        colors={["#e86bd8", "#f5f0fa", "#8b5bd6"]}
        background="#070a08"
        speed={1.0}
        count={9}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070a08]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0 whitespace-nowrap">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-xs">
              <Activity className="h-4 w-4" />
            </span>
            <span className="font-semibold text-lg tracking-tight text-white">
              KR<span className="text-emerald-400">-Signal</span>
            </span>
          </Link>

          {/* Right Actions: Desktop Nav */}
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-1.5 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "rounded-lg px-3.5 py-1.5 font-medium transition-all duration-150",
                    pathname === n.to
                      ? "bg-white/10 text-white shadow-xs"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
                  )}
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white md:hidden"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileOpen && (
          <div className="border-b border-white/10 bg-[#0a0e0b] px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3.5 py-2.5 font-medium transition-colors",
                    pathname === n.to
                      ? "bg-white/10 text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span>{n.label}</span>
                  {pathname === n.to && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20">{children}</main>

      {/* Expanded Multi-Column Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-[#050706]/80 backdrop-blur-md py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Col 1: Brand */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15 text-emerald-400">
                  <Activity className="h-3.5 w-3.5" />
                </span>
                <span className="font-semibold text-white">KR-Signal</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">
                Automated rule-based signal engine. Every setup published, every outcome graded on the market tape.
              </p>
            </div>

            {/* Col 2: Navigation */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Navigation</h4>
              <ul className="mt-3 space-y-2 text-xs text-zinc-400">
                {NAV.map((n) => (
                  <li key={n.to}>
                    <Link to={n.to} className="hover:text-emerald-400 transition-colors">
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3: Data & Market Notes */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Data Standards</h4>
              <ul className="mt-3 space-y-2 text-xs text-zinc-400 leading-relaxed">
                <li>• Spot feeds via Binance API</li>
                <li>• Gold proxy via PAXG/USDT</li>
                <li>• Forex proxies via EUR/USDT & GBP/USDT</li>
                <li>• Timestamps strictly in UTC</li>
              </ul>
            </div>

            {/* Col 4: Ledger Commitment */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Ledger Guarantee</h4>
              <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                No signal is ever edited or removed from the public ledger. Stopped-out setups stay in the win-rate denominator permanently.
              </p>
            </div>
          </div>

          <div className="mt-10 border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
            <p>© {new Date().getFullYear()} KR-Signal. Educational market research platform.</p>
            <p className="text-zinc-500">Trading involves substantial financial risk.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
