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
    const isSupabase = env.databaseUrl.includes("supabase") || env.databaseUrl.includes("pooler");
    const isProd = env.isProduction || Boolean(process.env.VERCEL);
    const useSsl = isSupabase || isProd;

    const client = postgres(env.databaseUrl, {
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

