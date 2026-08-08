import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
const appSecret = process.env.APP_SECRET;

if (!databaseUrl) {
  console.error(
    "[FATAL] DATABASE_URL is not set. " +
      "Set it in Vercel → Settings → Environment Variables and redeploy.",
  );
}

if (process.env.NODE_ENV === "production" && !appSecret) {
  throw new Error(
    "[FATAL] APP_SECRET is not set. Set it in Vercel → Settings → Environment Variables and redeploy.",
  );
}

export const env = {
  appId: process.env.APP_ID || "kr-signal",
  appSecret: appSecret || "",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: databaseUrl || "",
};
