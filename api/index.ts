import { handle } from "@hono/node-server/vercel";
// @ts-ignore
import app from "../dist/boot.js";

const vercelHandler = handle(app);

export const maxDuration = 60;

export default async function (req: any, res: any) {
  try {
    return await vercelHandler(req, res);
  } catch (err: any) {
    console.error("Vercel Function Error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: String(err?.message || "Internal Server Error"),
      }),
    );
  }
}
