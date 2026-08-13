import "dotenv/config";

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() !== "off";
}

export function missingProductionEnv(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  return [
    !environment.DATABASE_URL && "DATABASE_URL",
    !environment.APP_SECRET && "APP_SECRET",
    !environment.CRON_SECRET && "CRON_SECRET",
    isEnabled(environment.HF_AI_FORECASTS) &&
      !environment.HF_AI_SHARED_SECRET &&
      "HF_AI_SHARED_SECRET (required when HF_AI_FORECASTS is enabled)",
  ].filter((name): name is string => Boolean(name));
}

const databaseUrl = process.env.DATABASE_URL;
const appSecret = process.env.APP_SECRET;
const cronSecret = process.env.CRON_SECRET;

if (process.env.NODE_ENV === "production") {
  const missing = missingProductionEnv();

  if (missing.length > 0) {
    throw new Error(
      `[FATAL] Missing production environment variable(s): ${missing.join(
        ", "
      )}. Configure them in Vercel and redeploy.`,
    );
  }
}

export const env = {
  appId: process.env.APP_ID || "kr-signal",
  appSecret: appSecret || "",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: databaseUrl || "",
  cronSecret: cronSecret || "",
};
