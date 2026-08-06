import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

import { forceRunPipelinePass } from "./engine/pipeline";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

app.get("/api/health", (c) => c.json({ ok: true }));

const handleScan = async (c: any) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = c.req.header("authorization");
    const paramSecret = c.req.query("secret");
    if (authHeader !== `Bearer ${cronSecret}` && paramSecret !== cronSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }
  try {
    const report = await forceRunPipelinePass();
    return c.json({ ok: true, report });
  } catch (err) {
    console.error("/api/scan error:", err);
    return c.json({ error: String(err) }, 500);
  }
};

app.get("/api/scan", handleScan);
app.post("/api/scan", handleScan);

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

app.onError((err, c) => {
  console.error("Hono error:", err);
  return c.json({ error: String(err.message || err), stack: err.stack }, 500);
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

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
