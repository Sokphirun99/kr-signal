import "dotenv/config";

const DEFAULT_DB =
  "postgresql://postgres.swldhqwcwijgngheaynf:RONvip012550017@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";

export const env = {
  appId: process.env.APP_ID || "kr-signal",
  appSecret: process.env.APP_SECRET || "dev-secret-key-12345",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL || DEFAULT_DB,
};
