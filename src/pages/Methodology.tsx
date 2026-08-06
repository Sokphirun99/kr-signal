import Layout from "@/components/Layout";

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
      "All instruments resolve through Binance spot pairs. Crypto uses the direct pairs (BTCUSDT, ETHUSDT, SOLUSDT). Gold uses PAXG/USDT — a token redeemable for one troy ounce of gold, tracking spot with a small basis. EUR/USD and GBP/USD use the EUR/USDT and GBP/USDT pairs, which carry a small stablecoin basis versus interbank spot.",
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
  return (
    <Layout>
      <section className="py-10">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          How the numbers are made
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Methodology
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          The counting rules behind every number on the track record page —
          written down so the record can be checked, not just believed.
        </p>

        <div className="mt-10 grid gap-6">
          {SECTIONS.map((s) => (
            <article
              key={s.title}
              className="rounded-xl border border-white/5 bg-white/[0.03] p-6"
            >
              <h2 className="font-medium text-white">{s.title}</h2>
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
