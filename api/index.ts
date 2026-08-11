import { getRequestListener } from "@hono/node-server";
import type { IncomingMessage, ServerResponse } from "node:http";
// @ts-expect-error - dist/boot.js is created post-build
import app from "../dist/boot.js";

const vercelHandler = getRequestListener(app.fetch);

export const maxDuration = 120;

export default async function (req: IncomingMessage, res: ServerResponse) {
  try {
    return await vercelHandler(req, res);
  } catch (err: unknown) {
    console.error("Vercel Function Error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Internal Server Error",
      })
    );
  }
}
