import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import { SUPABASE_ROOT_CA_2021 } from "../lib/supabaseCa";
import * as schema from "@db/schema";

let instance: ReturnType<typeof drizzle<typeof schema>>;

export function formatSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  let url = rawUrl;

  // Convert direct host db.<ref>.supabase.co:5432 to transaction pooler
  const directMatch = url.match(
    /postgresql:\/\/postgres:(.+?)@db\.([a-z0-9]+)\.supabase\.co(?::5432)?\/postgres/
  );
  if (directMatch) {
    const password = directMatch[1];
    const projectRef = directMatch[2];
    url = `postgresql://postgres.${projectRef}:${password}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`;
  }

  // Convert pooler 5432 -> 6543
  if (url.includes("pooler.supabase.com:5432")) {
    url = url.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543");
  }

  return url;
}

type DatabaseSslConfig =
  | false
  | {
      rejectUnauthorized: true;
      ca?: string;
    };

export function getDatabaseSslConfig(
  dbUrl: string,
  isProduction: boolean,
  supabaseCa = SUPABASE_ROOT_CA_2021
): DatabaseSslConfig {
  const isSupabase = dbUrl.includes("supabase") || dbUrl.includes("pooler");
  if (isSupabase) {
    return { rejectUnauthorized: true, ca: supabaseCa };
  }
  return isProduction ? { rejectUnauthorized: true } : false;
}

export function getDb() {
  if (!instance) {
    if (!env.databaseUrl) {
      throw new Error("DATABASE_URL environment variable is missing.");
    }
    const dbUrl = formatSupabaseUrl(env.databaseUrl);
    const isProd = env.isProduction || Boolean(process.env.VERCEL);

    const client = postgres(dbUrl, {
      prepare: false,
      ssl: getDatabaseSslConfig(
        dbUrl,
        isProd,
        process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n") ||
          SUPABASE_ROOT_CA_2021
      ),
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
      fetch_types: false,
      connection: {
        // A single stalled query must not consume the full Vercel function
        // lifetime. Normal pipeline queries complete well below this limit.
        statement_timeout: 30_000,
      },
    });
    instance = drizzle(client, { schema });
  }
  return instance;
}
