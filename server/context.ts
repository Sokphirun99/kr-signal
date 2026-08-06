import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User, Session } from "@db/schema";
import { parseCookie, hashToken } from "./lib/auth";
import { findSessionWithUser } from "./queries/userQueries";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: User | null;
  session: Session | null;
  rawToken: string | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const cookieHeader = opts.req.headers.get("cookie");
  const rawToken = parseCookie(cookieHeader, "sid");

  let user: User | null = null;
  let session: Session | null = null;

  if (rawToken) {
    try {
      const tokenHash = hashToken(rawToken);
      const res = await findSessionWithUser(tokenHash);
      if (res) {
        user = res.user;
        session = res.session;
      }
    } catch (err) {
      console.error("Session verification error in context:", err);
    }
  }

  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
    user,
    session,
    rawToken,
  };
}

