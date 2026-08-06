import "dotenv/config";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is missing in environment.");
    process.exit(1);
  }

  console.log("🔒 Enabling Row Level Security (RLS) policies on Supabase...");

  const isSupabase = databaseUrl.includes("supabase") || databaseUrl.includes("pooler");
  const sqlClient = postgres(databaseUrl, {
    ssl: isSupabase ? { rejectUnauthorized: false } : false,
    max: 1,
  });

  const sqlFilePath = join(process.cwd(), "db", "enable-rls.sql");
  const sqlCommands = readFileSync(sqlFilePath, "utf8");

  await sqlClient.unsafe(sqlCommands);

  console.log("✅ Successfully enabled RLS security policies on users, sessions, signals, and scan_runs tables!");
  await sqlClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to enable RLS:", err);
  process.exit(1);
});
