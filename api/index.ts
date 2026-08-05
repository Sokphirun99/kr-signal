import { handle } from "@hono/node-server/vercel";
import app from "../server/boot";

export default handle(app);
