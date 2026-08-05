import { handle } from "hono/vercel";
import app from "../server/boot";

export default handle(app);
