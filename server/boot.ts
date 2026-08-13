import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext, disableResponseCache } from "./context";
import { env } from "./lib/env";
import {
  handleCronMaintenance,
  handleCronPipeline,
  handleCronVerification,
} from "./routes/cron";
import { publicApi } from "./routes/publicApi";

const app = new Hono<{ Bindings: HttpBindings }>();

// Keep the general request budget small. tRPC has its own stricter limit below.
app.use(bodyLimit({ maxSize: 1024 * 1024 }));

app.get("/api/health", c => c.json({ ok: true }));

app.get("/api/cron/pipeline", handleCronPipeline);
app.post("/api/cron/pipeline", handleCronPipeline);
app.get("/api/cron/verify", handleCronVerification);
app.post("/api/cron/verify", handleCronVerification);
app.get("/api/cron/maintenance", handleCronMaintenance);
app.post("/api/cron/maintenance", handleCronMaintenance);
app.get("/api/scan", handleCronPipeline);
app.post("/api/scan", handleCronPipeline);

app.route("/api/v1", publicApi);

app.use("/api/trpc/*", bodyLimit({ maxSize: 64 * 1024 }));
app.use("/api/trpc/*", async c => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
    allowBatching: false,
    responseMeta({ ctx, errors }) {
      if (ctx?.resHeaders) {
        if (errors.length > 0) {
          disableResponseCache(ctx.resHeaders);
          return { headers: ctx.resHeaders };
        }
        return {
          headers: ctx.resHeaders,
        };
      }
      return {};
    },
  });
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error("Hono error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

app.all("/api/*", c => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction && !process.env.VERCEL) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
