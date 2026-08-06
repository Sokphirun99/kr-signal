-- Revoke anonymous read access to scan_runs.
-- This table contains internal gate decisions (e.g. veto notes)
-- that are never exposed via the public UI.
-- The server-side funnel query uses the service-role key, so it is unaffected.

REVOKE SELECT ON public.scan_runs FROM anon;
REVOKE SELECT ON public.scan_runs FROM authenticated;
