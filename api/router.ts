import { createRouter, publicQuery } from "./middleware";
import { signalsRouter } from "./signalsRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  signals: signalsRouter,
});

export type AppRouter = typeof appRouter;
