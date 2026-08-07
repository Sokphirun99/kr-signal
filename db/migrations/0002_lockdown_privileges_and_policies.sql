-- Drop inert legacy RLS policy on scan_runs if present
DROP POLICY IF EXISTS "Public read access to scan_runs" ON public.scan_runs;

-- Revoke write/mutation privileges from public frontend roles on both tables
REVOKE ALL ON public.scan_runs, public.signals FROM anon, authenticated;

-- Explicitly re-grant SELECT access on signals for public frontend reads
GRANT SELECT ON public.signals TO anon, authenticated;
