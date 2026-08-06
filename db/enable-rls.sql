-- =====================================================================
-- Supabase Row Level Security (RLS) Hardening Script for KR-Signal
-- Execute this script in your Supabase SQL Editor to resolve RLS warnings.
-- =====================================================================

-- 1. Enable RLS on users table (COMPLETELY PRIVATE - NO ANON ACCESS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "No public access to users" ON public.users;

-- Policy: Block all anonymous and public API access to users table.
-- Backend Node server accesses database via direct DATABASE_URL connection (bypass RLS).
CREATE POLICY "No public access to users" ON public.users
  FOR ALL
  TO anon, authenticated
  USING (false);


-- 2. Enable RLS on sessions table (COMPLETELY PRIVATE - NO ANON ACCESS)
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No public access to sessions" ON public.sessions;

CREATE POLICY "No public access to sessions" ON public.sessions
  FOR ALL
  TO anon, authenticated
  USING (false);


-- 3. Enable RLS on signals table (PUBLIC READ ONLY FOR SIGNALS)
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access to signals" ON public.signals;

-- Allow public read access to signals feed (for tRPC / Supabase client queries)
CREATE POLICY "Public read access to signals" ON public.signals
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- 4. Enable RLS on scan_runs table (PUBLIC READ ONLY)
ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access to scan_runs" ON public.scan_runs;

CREATE POLICY "Public read access to scan_runs" ON public.scan_runs
  FOR SELECT
  TO anon, authenticated
  USING (true);
