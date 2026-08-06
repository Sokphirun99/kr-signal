import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "[FATAL] DATABASE_URL is not set. " +
    "Set it in Vercel → Settings → Environment Variables and redeploy."
  );
}

export const env = {
  appId: process.env.APP_ID || "kr-signal",
  appSecret: process.env.APP_SECRET || "dev-secret-key-12345",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: databaseUrl || "",
};

