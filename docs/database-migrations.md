# Database migration baseline

## Audit result (2026-08-10)

The live `kr-signal` Supabase project was inspected read-only. Its `public`
schema contains `signals`, `scan_runs`, and `news`; its unexposed `private`
schema contains `pipeline_leases` and `signal_events`. Before the new numeric
checks, columns, primary keys, the
`signal_events.signal_id -> signals.id ON DELETE CASCADE` foreign key, RLS
state, grants, and indexes matched `db/schema.ts`. The required
`signal_events_signal_occurred_idx (signal_id, occurred_at)` index exists.

Supabase migration history contains only:

```
20260810032541 signal_provenance_and_events
```

The old `db/migrations/0001..0007` files are therefore legacy change evidence,
not a reproducible history: `0001` assumes `signals` and `scan_runs` already
exist, and their numeric names are not Supabase migration versions.

## Canonical strategy

`supabase/migrations` is the only deployable migration directory:

1. `20260805000000_schema_baseline.sql` creates the audited pre-provenance
   schema. Its DDL, grants, and policies are idempotent on the matching live DB.
2. `20260810032541_signal_provenance_and_events.sql` uses the exact version
   already recorded in production and bootstraps/backfills events idempotently.
3. `20260810060000_signal_numeric_integrity.sql` adds forward-only validated
   checks for finite values and valid risk direction.

No production row is deleted, rewritten, truncated, or reset. Private tables
remain without public policies or Data API grants; advisor `rls_enabled_no_policy`
notices for these server-only tables are intentional.

## Production deployment procedure

Do not repair or insert migration-history rows by hand. The baseline was checked
against the actual schema, so the safe repair is to let Supabase execute its
idempotent statements and record it normally:

```bash
npx supabase link --project-ref swldhqwcwijgngheaynf
npm run db:migrate:dry-run
npm run db:migrate
```

The dry run must show `20260805000000_schema_baseline` and
`20260810060000_signal_numeric_integrity` as pending, while
`20260810032541_signal_provenance_and_events` remains applied. Stop if the
preview differs. Never run `supabase db reset --linked` against production.

For a new or local database, `supabase db reset --local` replays the complete
canonical history. This reset is permitted only for an empty/local database.
