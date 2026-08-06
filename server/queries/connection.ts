import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";

let instance: ReturnType<typeof drizzle<typeof schema>>;

export function getDb() {
  if (!instance) {
    if (!env.databaseUrl) {
      throw new Error("DATABASE_URL environment variable is missing.");
    }
    let dbUrl = env.databaseUrl;
    if (dbUrl.includes("pooler.supabase.com:5432")) {
      dbUrl = dbUrl.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543");
    }

    const isSupabase = dbUrl.includes("supabase") || dbUrl.includes("pooler");
    const isProd = env.isProduction || Boolean(process.env.VERCEL);
    const useSsl = isSupabase || isProd;

    const client = postgres(dbUrl, {
      prepare: false,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
      fetch_types: false,
    });
    instance = drizzle(client, { schema });
  }
  return instance;
}

