import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    const isSupabase = env.databaseUrl.includes("supabase");
    const client = postgres(env.databaseUrl, {
      prepare: false,
      ssl: isSupabase ? "require" : false,
      max: 1,
    });
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
