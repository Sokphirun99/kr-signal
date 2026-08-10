# KR Signal

KR Signal is a deterministic market-analysis and paper-execution ledger. It
scans completed candles, publishes setups that pass explicit confluence and
risk gates, and grades those setups against later market tape.

It does **not** place exchange orders. Entry, take-profit, stop-loss, and
trailing-stop behavior are planning and performance-simulation rules.

## Market-data boundary

| Instrument       | Price/ticker source                  | Supporting inputs                                                |
| ---------------- | ------------------------------------ | ---------------------------------------------------------------- |
| BTCUSDT, ETHUSDT | Binance USD-M Futures                | Futures funding, open interest, taker ratio; global Fear & Greed |
| XAUUSD           | Binance Spot PAXGUSDT proxy          | Price/volume indicators only                                     |
| EURUSD, GBPUSD   | Binance Spot EURUSDT/GBPUSDT proxies | Price/volume indicators only                                     |

Crypto OHLC and futures microstructure therefore come from the same Binance
product. Proxy instruments are labeled in the UI because USDT/token basis can
diverge from the underlying market.

## Pipeline

```text
completed market candles
        -> deterministic strategy
        -> confluence/risk gate
        -> permanent signal ledger
        -> completed-candle verifier
        -> lifecycle event ledger
        -> track record
```

The serverless pipeline uses an expiring PostgreSQL lease, so only one Vercel
instance performs a pass at a time. Each pass verifies open signals before it
scans for new ones. Global sentiment is fetched once per pass and shared across
crypto instruments.

Every published signal stores:

- its strategy input context;
- the immutable engine-configuration version;
- a heuristic confluence score;
- lifecycle events such as entry fill, TP touches, break-even/trailing-stop
  changes, and final closure.

The confluence score is **not a win probability**. Probability language should
only be used after the score is calibrated against a sufficiently large set of
out-of-sample outcomes.

## Verification assumptions

Official grading consumes completed candles only. Live ticker data may update
the dashboard sooner, but it does not commit track-record outcomes.

OHLC does not reveal the order of prices inside one candle. If a stop and one
or more targets are both inside the same candle, the verifier applies the
conservative stop-first assumption. Event timestamps identify the candle, not
an exact intrabar execution time. These assumptions make replay deterministic
but do not turn candle data into tick-level execution history.

Statuses are terminal rather than progressive: `open` remains open while TP1
and TP2 touches are recorded as events; `tp2` means a chandelier exit after TP2;
`tp3`, `sl`, and `be` are realized exits; `expired` and `undecidable` are
terminal but excluded from graded win-rate statistics.

## Data and security

- `public.signals`: publicly readable signal ledger; server-side writes only.
- `public.news`: publicly readable rolling seven-day context; never used by the
  strategy or verifier.
- `public.scan_runs`: internal funnel bookkeeping; no public policy.
- `private.pipeline_leases`: server-only concurrency coordination.
- `private.signal_events`: server-only immutable lifecycle audit trail.

Row-level security is enabled where appropriate, and private-schema tables are
not exposed through the Supabase Data API.

## Local development

Requirements: Node.js, npm, and a PostgreSQL/Supabase `DATABASE_URL`.

```bash
npm install
npm run dev
```

Relevant environment variables:

```text
DATABASE_URL   required for server/database work
APP_SECRET     required in production
CRON_SECRET    required by POST /api/cron/pipeline
APP_ID         optional; defaults to kr-signal
```

Apply the canonical `supabase/migrations` history before deploying server code
that depends on new columns or tables. See `docs/database-migrations.md` for the
non-destructive production baseline procedure.

## Validation

```bash
npm test
npm run check
npm run lint
npm run build
```

The deterministic tests cover strategy geometry, gate behavior, lifecycle
grading, R-multiple calculations, status semantics, database-error
classification, and market-source routing.
