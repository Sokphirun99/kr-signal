import { handle } from "@hono/node-server/vercel";
// @ts-ignore
import app from "../dist/boot.js";

export default handle(app);
