import { useEffect } from "react";
import Layout from "@/components/Layout";

const QUICK_RULES = [
  { label: "Confidence Floor", value: "60%" },
  { label: "Minimum Target", value: "≥ 1.4R" },
  { label: "Same-Candle Rule", value: "Stop First" },
  { label: "Gap-Through", value: "Graded at Open" },
  { label: "After TP1", value: "Break-Even" },
  { label: "After TP2", value: "2.5× ATR Trail" },
];

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What gets published",
    body: [
      "The engine scans every covered instrument on the 15m, 1h and 4h timeframes. A scan only becomes a candidate when the strategy finds a complete setup: entry, stop-loss and three targets, with geometry that makes sense.",
      "A candidate only publishes if it clears the gate: a confidence floor of 60, a first target of at least 1.4R, stop distance within sane bounds, and no open signal already running for that market and direction. Most candidates fail — that is intentional.",
    ],
  },
  {
    title: "How outcomes are graded",
    body: [
      "Grading walks the actual candle tape, candle by candle, from the setup candle forward. The entry price must be touched before any exit can count — a setup the market never filled simply expires.",
      "When a stop and a target fall inside the same candle, the conservative reading wins: stop first. The tape cannot tell us the intra-candle order, so we never grade in our own favor.",
      "If a candle opens beyond a stop — a gap straight through the level — the exit is graded at the candle's open price, not at the stop. Slippage counts against the record, so a stop-out can land slightly worse than -1R.",
      "After the first target is touched, the stop moves to break-even. A later reversal then closes the signal at 0R instead of a loss.",
      "After the second target is touched, the fixed third target is replaced with a dynamic 2.5×ATR trailing stop (ratcheted strictly in the trade's favor), graded the same conservative way on any trail breach.",
    ],
  },
  {
    title: "What enters the win rate — and what never does",
    body: [
      "The win rate is wins ÷ graded outcomes, where a graded outcome is a signal whose take-profit, stop-loss or break-even level was actually touched. Every stop-loss stays in the denominator. Nothing is dropped for losing.",
      "Expired setups — no level touched in time — are reported in the ledger and beside the stats, but never inside the formula, in either direction. Undecidable rows (tape coverage insufficient to grade honestly) are treated the same way.",
    ],
  },
  {
    title: "Data sources and basis",
    body: [
      "All instruments resolve through Binance spot pairs. Crypto uses direct pairs (BTCUSDT, ETHUSDT, SOLUSDT). Gold uses PAXG/USDT — a token redeemable for one troy ounce of gold, tracking spot with a small basis. EUR/USD and GBP/USD use EUR/USDT and GBP/USDT pairs, which carry a small stablecoin basis versus interbank spot.",
      "Outcomes are graded against this reference tape, not against any broker's execution feed. Levels touched here may print slightly differently on your venue.",
    ],
  },
  {
    title: "The rule engine, today",
    body: [
      "Every signal currently carries the “Rule engine” label: deterministic strategy plus heuristic confidence scoring. An AI council — multi-model review of each candidate — is on the roadmap; when it ships, signals it produces will carry their own label and rule-engine rows will stay visible and separately counted.",
    ],
  },
];

export default function Methodology() {
  useEffect(() => {
    document.title = "Engine Methodology & Rules — KR-Signal";
  }, []);

  return (
    <Layout>
      <section className="py-10">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
          How the numbers are made
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Engine methodology & rules
        </h1>
        <p className="mt-2 max-w-2xl text-base text-zinc-400 leading-relaxed">
          The counting rules behind every number on our track record page — written down in detail so the record can be independently checked.
        </p>

        {/* Quick Rules at a Glance Strip */}
        <div className="mt-8 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-5 shadow-xs">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Rules at a Glance
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 font-mono text-xs">
            {QUICK_RULES.map((r) => (
              <div key={r.label} className="rounded-lg border border-white/10 bg-black/40 p-2.5">
                <span className="block text-[10px] font-sans uppercase tracking-wider text-zinc-400 font-medium">
                  {r.label}
                </span>
                <span className="mt-1 block font-bold text-emerald-300 tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Sections */}
        <div className="mt-10 grid gap-6">
          {SECTIONS.map((s) => (
            <article
              key={s.title}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-6 shadow-xs"
            >
              <h2 className="text-lg font-semibold text-white">{s.title}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {p}
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>
    </Layout>
  );
}
