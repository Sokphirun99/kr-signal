import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn("[WARNING] DATABASE_URL is not set in environment variables.");
}

export const env = {
  appId: process.env.APP_ID || "kr-signal",
  appSecret: process.env.APP_SECRET || "dev-secret-key-12345",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: databaseUrl || "",
};

