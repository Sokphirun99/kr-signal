import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";

let instance: ReturnType<typeof drizzle<typeof schema>>;

export function getDb() {
  if (!instance) {
    const isSupabase = env.databaseUrl.includes("supabase");
    const client = postgres(env.databaseUrl, {
      prepare: false,
      ssl: isSupabase ? { rejectUnauthorized: false } : false,
      max: 1,
      connect_timeout: 10,
    });
    instance = drizzle(client, { schema });
  }
  return instance;
}

