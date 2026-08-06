import { handle } from "@hono/node-server/vercel";
import app from "../server/boot";

const vercelHandler = handle(app);

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
