-- Database-level defense against invalid risk geometry and non-finite results.
-- Historical range rows may have TP2 = TP3, so the DB preserves those rows;
-- current application gates require strictly ordered targets.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signals_finite_levels_check'
      AND conrelid = 'public.signals'::regclass
  ) THEN
    ALTER TABLE public.signals
      ADD CONSTRAINT signals_finite_levels_check CHECK (
        entry::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND stop_loss::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND tp1::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND tp2::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND tp3::text NOT IN ('NaN', 'Infinity', '-Infinity')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signals_risk_geometry_check'
      AND conrelid = 'public.signals'::regclass
  ) THEN
    ALTER TABLE public.signals
      ADD CONSTRAINT signals_risk_geometry_check CHECK (
        entry > 0 AND (
          (side = 'buy' AND stop_loss < entry AND entry < tp1
            AND tp1 <= tp2 AND tp2 <= tp3)
          OR
          (side = 'sell' AND stop_loss > entry AND entry > tp1
            AND tp1 >= tp2 AND tp2 >= tp3)
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signals_finite_results_check'
      AND conrelid = 'public.signals'::regclass
  ) THEN
    ALTER TABLE public.signals
      ADD CONSTRAINT signals_finite_results_check CHECK (
        (exit_price IS NULL OR exit_price::text NOT IN ('NaN', 'Infinity', '-Infinity'))
        AND (r_multiple IS NULL OR r_multiple::text NOT IN ('NaN', 'Infinity', '-Infinity'))
      ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signal_events_finite_price_check'
      AND conrelid = 'private.signal_events'::regclass
  ) THEN
    ALTER TABLE private.signal_events
      ADD CONSTRAINT signal_events_finite_price_check CHECK (
        price IS NULL OR price::text NOT IN ('NaN', 'Infinity', '-Infinity')
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.signals VALIDATE CONSTRAINT signals_finite_levels_check;
ALTER TABLE public.signals VALIDATE CONSTRAINT signals_risk_geometry_check;
ALTER TABLE public.signals VALIDATE CONSTRAINT signals_finite_results_check;
ALTER TABLE private.signal_events
  VALIDATE CONSTRAINT signal_events_finite_price_check;
