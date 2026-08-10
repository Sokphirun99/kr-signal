-- Audited baseline for the schema that existed before the versioned
-- signal-provenance migration. Every operation is safe on the matching live
-- database and the complete file can bootstrap a new Supabase/PostgreSQL 17 DB.

DO $$ BEGIN
  CREATE TYPE public.market AS ENUM ('crypto', 'gold', 'forex');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.timeframe AS ENUM ('15m', '1h', '4h');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.style AS ENUM ('trend', 'range');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.side AS ENUM ('buy', 'sell');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.status AS ENUM (
    'open', 'tp1', 'tp2', 'tp3', 'sl', 'be', 'expired', 'undecidable'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.engine AS ENUM ('rules', 'ai');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.signals (
  id serial PRIMARY KEY,
  symbol varchar(20) NOT NULL,
  market public.market NOT NULL,
  timeframe public.timeframe NOT NULL,
  style public.style NOT NULL,
  side public.side NOT NULL,
  entry double precision NOT NULL,
  stop_loss double precision NOT NULL,
  tp1 double precision NOT NULL,
  tp2 double precision NOT NULL,
  tp3 double precision NOT NULL,
  confidence integer NOT NULL,
  status public.status NOT NULL DEFAULT 'open',
  engine public.engine NOT NULL DEFAULT 'rules',
  entry_filled boolean NOT NULL DEFAULT false,
  r_multiple double precision,
  exit_price double precision,
  setup_at timestamptz NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS signal_dedupe
  ON public.signals (symbol, timeframe, style, setup_at);
CREATE INDEX IF NOT EXISTS status_idx ON public.signals (status);
CREATE INDEX IF NOT EXISTS symbol_idx ON public.signals (symbol);
CREATE INDEX IF NOT EXISTS opened_idx ON public.signals (opened_at);

CREATE TABLE IF NOT EXISTS public.scan_runs (
  id serial PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  symbol varchar(20) NOT NULL,
  timeframe public.timeframe NOT NULL,
  candidates integer NOT NULL DEFAULT 0,
  published integer NOT NULL DEFAULT 0,
  note varchar(255)
);
CREATE INDEX IF NOT EXISTS ran_idx ON public.scan_runs (ran_at);

CREATE TABLE IF NOT EXISTS public.news (
  id serial PRIMARY KEY,
  url text NOT NULL UNIQUE,
  title text NOT NULL,
  source varchar(100) NOT NULL,
  sources jsonb,
  summary text,
  image_url text,
  matched_symbols jsonb NOT NULL,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_published_idx ON public.news (published_at);

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.pipeline_leases (
  name text PRIMARY KEY,
  owner text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.pipeline_leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access to signals" ON public.signals;
CREATE POLICY "Public read access to signals" ON public.signals
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public read access to news" ON public.news;
CREATE POLICY "Public read access to news" ON public.news
  FOR SELECT TO public
  USING (published_at >= now() - interval '7 days');
DROP POLICY IF EXISTS "Public read access to scan_runs" ON public.scan_runs;

REVOKE ALL ON public.signals, public.scan_runs, public.news
  FROM anon, authenticated;
GRANT SELECT ON public.signals, public.news TO anon, authenticated;
GRANT ALL ON public.signals, public.scan_runs, public.news TO service_role;
GRANT ALL ON SEQUENCE public.signals_id_seq, public.scan_runs_id_seq,
  public.news_id_seq TO service_role;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON private.pipeline_leases
  FROM PUBLIC, anon, authenticated, service_role;
