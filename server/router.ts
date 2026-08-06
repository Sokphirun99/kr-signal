import { createRouter, publicQuery } from "./middleware";
import { signalsRouter } from "./signalsRouter";
import { authRouter } from "./authRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  signals: signalsRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;

