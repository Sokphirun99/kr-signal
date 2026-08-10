-- Internal, short-lived lease used to prevent overlapping pipeline workers
-- across separate Vercel function instances.
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS private.pipeline_leases (
  name text PRIMARY KEY,
  owner text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.pipeline_leases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON private.pipeline_leases FROM PUBLIC, anon, authenticated, service_role;
