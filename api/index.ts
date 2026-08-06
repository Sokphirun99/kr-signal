import { handle } from "@hono/node-server/vercel";
import type { IncomingMessage, ServerResponse } from "node:http";
// @ts-expect-error - dist/boot.js is created post-build
import app from "../dist/boot.js";

const vercelHandler = handle(app);

export const maxDuration = 60;

export default async function (req: IncomingMessage, res: ServerResponse) {
  try {
    return await vercelHandler(req, res);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Vercel Function Error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: errorMsg || "Internal Server Error",
      }),
    );
  }
}
