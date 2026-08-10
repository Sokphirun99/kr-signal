import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
};

const cachePolicyByResponse = new WeakMap<Headers, CachePolicy>();

type CachePolicy = {
  maxAgeSeconds: number;
  staleWhileRevalidateSeconds: number;
};

/**
 * Marks a successful public tRPC read as safe for shared CDN caching.
 * Batched queries use the shortest policy in the batch so faster-changing
 * data never inherits a slower endpoint's lifetime.
 */
export function setPublicReadCache(
  ctx: TrpcContext,
  maxAgeSeconds: number,
  staleWhileRevalidateSeconds: number
): void {
  const previous = cachePolicyByResponse.get(ctx.resHeaders);
  const policy = {
    maxAgeSeconds: Math.min(previous?.maxAgeSeconds ?? Infinity, maxAgeSeconds),
    staleWhileRevalidateSeconds: Math.min(
      previous?.staleWhileRevalidateSeconds ?? Infinity,
      staleWhileRevalidateSeconds
    ),
  };
  cachePolicyByResponse.set(ctx.resHeaders, policy);

  const sharedPolicy = `public, s-maxage=${policy.maxAgeSeconds}, stale-while-revalidate=${policy.staleWhileRevalidateSeconds}`;
  ctx.resHeaders.set("Cache-Control", "public, max-age=0, must-revalidate");
  ctx.resHeaders.set("CDN-Cache-Control", sharedPolicy);
  ctx.resHeaders.set("Vercel-CDN-Cache-Control", sharedPolicy);
}

export function disableResponseCache(headers: Headers): void {
  cachePolicyByResponse.delete(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.delete("CDN-Cache-Control");
  headers.delete("Vercel-CDN-Cache-Control");
}

export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
  };
}
