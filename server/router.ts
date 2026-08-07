import { createRouter, publicQuery } from "./middleware";
import { signalsRouter } from "./routers/signalsRouter";
import { newsRouter } from "./routers/newsRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  signals: signalsRouter,
  news: newsRouter,
});


export type AppRouter = typeof appRouter;
