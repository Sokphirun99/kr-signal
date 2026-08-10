# Legacy migration evidence

The numbered SQL files (`0001` through `0006`) record changes applied while
the initial schema still lived outside version control. They are not a complete
fresh-database chain and must not be passed to a migration runner.

The canonical, deployable Supabase history is now in `supabase/migrations`.
Drizzle's `db/schema.ts` remains the application schema model, not a second
migration source.
