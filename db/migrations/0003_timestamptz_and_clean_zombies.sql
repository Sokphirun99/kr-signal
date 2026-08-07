-- 1. Migrate timestamp columns to timestamptz (with timezone UTC)
ALTER TABLE public.signals ALTER COLUMN setup_at TYPE timestamptz USING setup_at AT TIME ZONE 'UTC';
ALTER TABLE public.signals ALTER COLUMN opened_at TYPE timestamptz USING opened_at AT TIME ZONE 'UTC';
ALTER TABLE public.signals ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE public.signals ALTER COLUMN closed_at TYPE timestamptz USING closed_at AT TIME ZONE 'UTC';
ALTER TABLE public.scan_runs ALTER COLUMN ran_at TYPE timestamptz USING ran_at AT TIME ZONE 'UTC';

-- 2. Clean up zombie signals for delisted instruments (e.g. SOLUSDT)
UPDATE public.signals
SET status = 'undecidable', closed_at = NOW()
WHERE symbol NOT IN ('BTCUSDT', 'ETHUSDT', 'XAUUSD', 'EURUSD', 'GBPUSD')
  AND status = 'open';
