-- This version and name exactly match the migration already recorded by the
-- live Supabase project. The statements remain idempotent for fresh databases.

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS strategy_context jsonb,
  ADD COLUMN IF NOT EXISTS engine_config_version integer NOT NULL DEFAULT 1;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS private.signal_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL,
  signal_id integer NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  price double precision,
  occurred_at timestamptz NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS signal_events_event_key_uidx
  ON private.signal_events (event_key);
CREATE INDEX IF NOT EXISTS signal_events_signal_occurred_idx
  ON private.signal_events (signal_id, occurred_at);

ALTER TABLE private.signal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.signal_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE private.signal_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.signal_events (
  event_key, signal_id, event_type, price, occurred_at, metadata
)
SELECT
  concat(id, ':SIGNAL_CREATED:',
    (extract(epoch FROM setup_at) * 1000)::bigint, ':none'),
  id,
  'SIGNAL_CREATED',
  NULL,
  setup_at,
  jsonb_build_object(
    'engine', engine,
    'engineConfigVersion', engine_config_version,
    'confluenceScore', confidence,
    'backfilled', true
  )
FROM public.signals
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO private.signal_events (
  event_key, signal_id, event_type, price, occurred_at, metadata
)
SELECT
  concat(
    id, ':',
    CASE
      WHEN status = 'expired' THEN 'EXPIRED'
      WHEN status = 'undecidable' THEN 'UNDECIDABLE'
      ELSE 'CLOSED'
    END,
    ':', (extract(epoch FROM closed_at) * 1000)::bigint, ':',
    coalesce(round(exit_price::numeric, 8)::text, 'none')
  ),
  id,
  CASE
    WHEN status = 'expired' THEN 'EXPIRED'
    WHEN status = 'undecidable' THEN 'UNDECIDABLE'
    ELSE 'CLOSED'
  END,
  exit_price,
  closed_at,
  jsonb_build_object(
    'status', status,
    'rMultiple', r_multiple,
    'backfilled', true
  )
FROM public.signals
WHERE status <> 'open' AND closed_at IS NOT NULL
ON CONFLICT (event_key) DO NOTHING;
