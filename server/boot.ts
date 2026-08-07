import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { handleCronPipeline } from "./routes/cron";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/cron/pipeline", handleCronPipeline);
app.post("/api/cron/pipeline", handleCronPipeline);
app.get("/api/scan", handleCronPipeline);
app.post("/api/scan", handleCronPipeline);

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
    responseMeta({ ctx }) {
      if (ctx?.resHeaders) {
        return {
          headers: ctx.resHeaders,
        };
      }
      return {};
    },
  });
});

app.onError((err, c) => {
  console.error("Hono error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
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
